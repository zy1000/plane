# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""反查「谁能看到某个项目」（项目设置 › 权限 › 可见人员），以及这些人在项目里有多少项目权限。

可见规则与 utils/visibility.py 的正向判断一致：
直通（工作区所有者 / 实例管理员）∪ 活跃项目成员 ∪ 项目负责人 ∪ 白名单含本项目的「数据权限」组里的人；
除直通外都要是工作区活跃成员。

项目权限与 permissions/base.py 的 resolve_project_grant 一致：直通（所有者、实例管理员、负责人，没有负责人时是创建人）
= 全部；其余 = 所在工作区权限组的项目 key ∪ 本项目绑定的项目权限组（只有项目成员有）。
"""

from collections import defaultdict

from plane.app.permissions.base import combine_payloads, project_role_payload, role_payload, user_project_roles
from plane.app.permissions.registry import PROJECT_KEYS
from plane.db.models import (
    Permission,
    ProjectMember,
    User,
    WorkspaceGroupMember,
    WorkspaceMember,
    WorkspaceMemberRole,
    WorkspaceRole,
)
from plane.license.models import Instance, InstanceAdmin
from plane.utils.data_scope import VALUE_ME, evaluate_entry, template_references_project


def _instance_admin_ids():
    instance = Instance.objects.first()
    if instance is None:
        return set()
    return set(InstanceAdmin.objects.filter(instance=instance).values_list("user_id", flat=True))


def _is_personal(entry):
    """白名单条件里用了「我」时，每个人算出来的范围不一样，要逐人算。"""
    if not isinstance(entry, dict) or entry.get("mode") != "filter":
        return False

    def walk(node):
        if isinstance(node, dict):
            return any(walk(value) for value in node.values())
        if isinstance(node, (list, tuple)):
            return any(walk(value) for value in node)
        return isinstance(node, str) and VALUE_ME in [part.strip() for part in node.split(",")]

    return walk(entry.get("filter") or {})


def _role_bindings(workspace):
    """{工作区成员 id: {权限组 id: 团队名}}：直绑记 None，经团队记团队名（直绑优先）。"""
    bindings = defaultdict(dict)
    for member_id, role_id, team_name in WorkspaceGroupMember.objects.filter(
        group__workspace=workspace,
        deleted_at__isnull=True,
        group__deleted_at__isnull=True,
        group__group_roles__deleted_at__isnull=True,
        group__group_roles__role__deleted_at__isnull=True,
    ).values_list("member_id", "group__group_roles__role_id", "group__name"):
        if role_id:
            bindings[member_id].setdefault(role_id, team_name)
    for member_id, role_id in WorkspaceMemberRole.objects.filter(
        workspace=workspace, deleted_at__isnull=True, role__deleted_at__isnull=True
    ).values_list("member_id", "role_id"):
        bindings[member_id][role_id] = None
    return bindings


def project_audience(project, with_permissions=True):
    """能看到本项目的人。

    返回 ``people``（{用户 id: 条目}）、``workspace_roles``（工作区权限组，按创建时间）、``data_groups``（覆盖到本项目的数据权限）、
    ``workspace_member_count``、``total_permission_count``。条目：``user``、``sources``（为什么能看到）、``is_member``、
    ``passthrough``（直通，本来就有全部权限）、``bindings``（{权限组 id: 团队名}）；``with_permissions`` 时再带
    ``permission_count`` 与 ``permission_groups``（给出项目权限的组）。
    """
    workspace = project.workspace
    ws_members = {
        member.member_id: member
        for member in WorkspaceMember.objects.filter(
            workspace=workspace, is_active=True, deleted_at__isnull=True
        ).select_related("member")
    }
    ws_member_by_id = {member.id: member for member in ws_members.values()}
    roles = list(
        WorkspaceRole.objects.filter(
            workspace=workspace,
            deleted_at__isnull=True,
            kind__in=[WorkspaceRole.KIND_WORKSPACE, WorkspaceRole.KIND_DATA],
        ).order_by("created_at")
    )
    bindings = _role_bindings(workspace)
    holders_by_role = defaultdict(list)
    for member_id, role_map in bindings.items():
        for role_id, team_name in role_map.items():
            holders_by_role[role_id].append((member_id, team_name))

    people = {}

    def add(user, source):
        entry = people.get(user.id)
        if entry is None:
            entry = people[user.id] = {"user": user, "sources": []}
        entry["sources"].append(source)

    # 直通：工作区所有者、实例管理员（不在工作区也能看到）
    owner_id = workspace.owner_id
    admin_ids = _instance_admin_ids()
    passthrough_users = {
        user_id: member.member for user_id, member in ws_members.items() if user_id == owner_id or user_id in admin_ids
    }
    missing = ({owner_id} | admin_ids) - set(passthrough_users)
    if missing:
        passthrough_users.update({user.id: user for user in User.objects.filter(id__in=missing)})
    for user_id, user in passthrough_users.items():
        if user_id == owner_id:
            add(user, {"type": "owner"})
        if user_id in admin_ids:
            add(user, {"type": "instance_admin"})

    # 负责人
    lead_id = project.project_lead_id
    if lead_id and lead_id in ws_members:
        add(ws_members[lead_id].member, {"type": "lead"})

    # 项目成员
    project_members = {
        row.member_id: row
        for row in ProjectMember.objects.filter(project=project, is_active=True, deleted_at__isnull=True)
        if row.member_id in ws_members
    }
    for user_id in project_members:
        add(ws_members[user_id].member, {"type": "member"})

    # 数据权限：白名单含本项目的组里的人（条件里有「我」的逐人算）
    data_groups = []
    for role in roles:
        if role.kind != WorkspaceRole.KIND_DATA:
            continue
        entry = (role.data_scope or {}).get("projects") if isinstance(role.data_scope, dict) else None
        personal = _is_personal(entry)
        if not personal and not evaluate_entry(entry, "projects", workspace).contains(project.id):
            continue
        covered = 0
        for member_id, team_name in holders_by_role.get(role.id, []):
            member = ws_member_by_id.get(member_id)
            if member is None:
                continue
            if personal and not evaluate_entry(entry, "projects", workspace, member.member).contains(project.id):
                continue
            add(
                member.member,
                {"type": "data", "role_id": str(role.id), "role_name": role.name, "team": team_name},
            )
            covered += 1
        if covered:
            data_groups.append(
                {"id": str(role.id), "name": role.name, "mode": (entry or {}).get("mode", "all") if isinstance(entry, dict) else "all"}
            )

    inactive = frozenset(
        Permission.objects.filter(is_active=False, deleted_at__isnull=True).values_list("key", flat=True)
    )
    total = len(PROJECT_KEYS - inactive)
    workspace_roles = [role for role in roles if role.kind == WorkspaceRole.KIND_WORKSPACE]
    workspace_payloads = {role.id: role_payload(role.permissions, PROJECT_KEYS) for role in workspace_roles}
    role_names = {role.id: role.name for role in roles}
    grant_passthrough_ids = {owner_id, project.project_lead_id or project.created_by_id} | admin_ids

    for user_id, entry in people.items():
        member = ws_members.get(user_id)
        entry["is_member"] = user_id in project_members
        entry["passthrough"] = user_id in grant_passthrough_ids
        entry["bindings"] = bindings.get(member.id, {}) if member else {}
        if not with_permissions:
            continue
        if entry["passthrough"]:
            entry["permission_count"] = total
            entry["permission_groups"] = []
            continue
        payloads, groups = [], []
        for role_id in entry["bindings"]:
            payload = workspace_payloads.get(role_id)
            if payload and payload[0]:
                payloads.append(payload)
                groups.append({"id": str(role_id), "name": role_names[role_id], "kind": "workspace"})
        member_row = project_members.get(user_id)
        if member_row is not None:
            for project_role in user_project_roles(entry["user"], member_row, project.id):
                template = project_role.source_template
                if template is not None and not template_references_project(template, project.id, entry["user"]):
                    continue
                payload = project_role_payload(project_role)
                if payload[0]:
                    payloads.append(payload)
                    groups.append(
                        {
                            "id": str(project_role.id),
                            "name": template.name if template is not None else project_role.name,
                            "kind": "project",
                        }
                    )
        keys, _ = combine_payloads(payloads)
        entry["permission_count"] = len(keys - inactive)
        entry["permission_groups"] = groups

    return {
        "people": people,
        "workspace_roles": workspace_roles,
        "data_groups": data_groups,
        "workspace_member_count": len(ws_members),
        "total_permission_count": total,
    }


def project_visible_members_payload(project):
    """「可见人员」页签的接口数据。人员排序：项目外在前，权限多的在前，再按名字。"""
    audience = project_audience(project)
    entries = sorted(
        audience["people"].values(),
        key=lambda entry: (entry["is_member"], -entry["permission_count"], entry["user"].display_name or ""),
    )
    return {
        "workspace_member_count": audience["workspace_member_count"],
        "total_permission_count": audience["total_permission_count"],
        "data_groups": audience["data_groups"],
        "people": [
            {
                "id": str(entry["user"].id),
                "display_name": entry["user"].display_name,
                "is_member": entry["is_member"],
                "passthrough": entry["passthrough"],
                "sources": entry["sources"],
                "permission_count": entry["permission_count"],
                "permission_groups": entry["permission_groups"],
            }
            for entry in entries
        ],
    }
