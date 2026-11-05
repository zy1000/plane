# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""工作区设置 › 我的权限（docs/permission-refactor/split-plan.md 之后的三类权限组模型）。

给本人看的四件事：
1. 身份：角色、直通身份（所有者 / 实例管理员 / 负责的项目数）、加入时间。
2. 我能看到什么：可见项目 / 产品及每一条的来源（成员 / 负责人 / 哪个数据权限 / 直通）。
3. 我能做什么：工作区 key 与项目 key（默认「全部可见项目」= 各工作区权限组项目 key 的并集；
   切到某个项目再并上那里绑定的模板 / 本项目组），每个 key 带来源。
4. 权限来自哪里：工作区权限组 / 数据权限 / 所在团队。
返回的都是 JSON 能直接吐的基本类型（id 字符串、时间 isoformat）。
"""

from collections import defaultdict

from plane.app.permissions.base import (
    _get_user_workspace_permission_keys,
    _inactive_keys,
    _is_instance_admin,
    is_project_passthrough,
    resolve_project_grant,
    user_project_roles,
)
from plane.app.permissions.registry import PROJECT_KEYS
from plane.db.models import (
    Product,
    ProductProject,
    Project,
    ProjectMember,
    WorkspaceGroup,
    WorkspaceGroupMember,
    WorkspaceGroupRole,
    WorkspaceMember,
    WorkspaceMemberRole,
    WorkspaceRole,
)
from plane.utils.data_scope import role_scope, template_references_project
from plane.utils.job_role import job_role_items
from plane.utils.permission_groups import effective_payload
from plane.utils.visibility import visible_product_scope, visible_project_scope


def _ref(entity):
    return {"id": str(entity.id), "name": entity.name} if entity is not None else None


def _source(type_, role=None, team=None):
    return {"type": type_, "role": _ref(role), "team": _ref(team)}


class _Bindings:
    """此人在工作区绑的组：直绑 + 经团队，按 kind 分开，并记住每个组经哪些团队来。"""

    def __init__(self, workspace, workspace_member):
        self.workspace = workspace
        self.member = workspace_member
        self.direct_ids = set()
        self.teams_by_role = defaultdict(list)  # role_id -> [WorkspaceGroup]
        self.roles = {}  # role_id -> WorkspaceRole
        self.teams = []  # [WorkspaceGroup]
        self.team_member_counts = {}
        if workspace_member is None:
            return
        for row in (
            WorkspaceMemberRole.objects.filter(
                member=workspace_member, workspace=workspace, deleted_at__isnull=True, role__deleted_at__isnull=True
            )
            .select_related("role")
            .order_by("role__name")
        ):
            self.direct_ids.add(row.role_id)
            self.roles[row.role_id] = row.role
        memberships = list(
            WorkspaceGroupMember.objects.filter(
                member=workspace_member, group__workspace=workspace, group__deleted_at__isnull=True, deleted_at__isnull=True
            )
            .select_related("group")
            .order_by("group__name")
        )
        self.teams = [row.group for row in memberships]
        team_ids = [team.id for team in self.teams]
        if team_ids:
            for row in (
                WorkspaceGroupRole.objects.filter(
                    group_id__in=team_ids, deleted_at__isnull=True, role__deleted_at__isnull=True
                )
                .select_related("group", "role")
                .order_by("role__name")
            ):
                self.roles[row.role_id] = row.role
                self.teams_by_role[row.role_id].append(row.group)
            counts = (
                WorkspaceGroupMember.objects.filter(
                    group_id__in=team_ids, deleted_at__isnull=True, member__is_active=True, member__deleted_at__isnull=True
                )
                .values_list("group_id")
                .annotate(n=__import__("django.db.models", fromlist=["Count"]).Count("member_id", distinct=True))
            )
            self.team_member_counts = {group_id: n for group_id, n in counts}

    def of_kind(self, kind):
        return [role for role in self.roles.values() if role.kind == kind]

    def team_of(self, role_id):
        """来源标注用：直绑就不标团队；只经团队来的标第一个团队。"""
        if role_id in self.direct_ids:
            return None
        teams = self.teams_by_role.get(role_id) or []
        return teams[0] if teams else None

    def group_payload(self, role, scope_counts=None):
        payload = effective_payload(role)
        keys = payload["permission_keys"]
        item = {
            "id": str(role.id),
            "name": role.name,
            "description": role.description,
            "kind": role.kind,
            "project_permission_count": len([k for k in keys if k.startswith("project.")]),
            "workspace_permission_count": len([k for k in keys if k.startswith("workspace.")]),
            "is_direct": role.id in self.direct_ids,
            "teams": [_ref(team) for team in self.teams_by_role.get(role.id, [])],
        }
        if scope_counts is not None:
            item["project_count"], item["product_count"] = scope_counts
        return item


def _workspace_member(workspace, user):
    return WorkspaceMember.objects.filter(
        workspace=workspace, member=user, is_active=True, deleted_at__isnull=True
    ).first()


def _passthrough_type(workspace, user):
    if workspace.owner_id == user.id:
        return "workspace_owner"
    if _is_instance_admin(user):
        return "instance_admin"
    return None


# ---------------------------------------------------------------------------
# 可见范围
# ---------------------------------------------------------------------------


def _visible_projects(workspace, user, bindings, passthrough):
    scope = visible_project_scope(user, workspace)
    queryset = Project.objects.filter(workspace=workspace, archived_at__isnull=True)
    if not scope.all:
        queryset = queryset.filter(id__in=list(scope.ids))
    rows = list(queryset.order_by("name").values("id", "name", "identifier", "project_lead_id", "created_by_id"))
    member_ids = set(
        ProjectMember.objects.filter(member=user, workspace=workspace, is_active=True, deleted_at__isnull=True).values_list(
            "project_id", flat=True
        )
    )
    data_groups = bindings.of_kind(WorkspaceRole.KIND_DATA)
    group_scopes = [(role, role_scope(role, "projects", workspace, user)) for role in data_groups]
    by_source = defaultdict(int)
    items = []
    for row in rows:
        pid = str(row["id"])
        sources = []
        if passthrough:
            sources.append({"type": "passthrough", "group": None})
        is_lead = (row["project_lead_id"] == user.id) if row["project_lead_id"] else row["created_by_id"] == user.id
        if is_lead:
            sources.append({"type": "lead", "group": None})
        if row["id"] in member_ids:
            sources.append({"type": "member", "group": None})
        for role, result in group_scopes:
            if result.contains(pid):
                sources.append({"type": "data_scope", "group": _ref(role)})
        for source in sources:
            by_source[source["type"]] += 1
        items.append(
            {
                "id": pid,
                "name": row["name"],
                "identifier": row["identifier"],
                "is_member": row["id"] in member_ids,
                "is_lead": is_lead,
                "sources": sources,
            }
        )
    return {"total": len(items), "by_source": dict(by_source), "items": items}


def _visible_products(workspace, user, bindings, passthrough, visible_project_ids):
    scope = visible_product_scope(user, workspace)
    queryset = Product.objects.filter(workspace=workspace)
    if not scope.all:
        queryset = queryset.filter(id__in=list(scope.ids))
    rows = list(queryset.order_by("name").values("id", "name", "identifier", "owner_id"))
    product_ids = [row["id"] for row in rows]
    reviewer_ids = set(
        Product.reviewers.through.objects.filter(product_id__in=product_ids, user_id=user.id).values_list(
            "product_id", flat=True
        )
    )
    linked = defaultdict(set)
    for product_id, project_id in ProductProject.objects.filter(
        product_id__in=product_ids, project__deleted_at__isnull=True
    ).values_list("product_id", "project_id"):
        if str(project_id) in visible_project_ids:
            linked[product_id].add(project_id)
    data_groups = bindings.of_kind(WorkspaceRole.KIND_DATA)
    group_scopes = [(role, role_scope(role, "products", workspace, user)) for role in data_groups]
    by_source = defaultdict(int)
    items = []
    for row in rows:
        pid = str(row["id"])
        sources = []
        if passthrough:
            sources.append({"type": "passthrough", "group": None})
        if row["owner_id"] == user.id:
            sources.append({"type": "owner", "group": None})
        if row["id"] in reviewer_ids:
            sources.append({"type": "reviewer", "group": None})
        for role, result in group_scopes:
            if result.contains(pid):
                sources.append({"type": "data_scope", "group": _ref(role)})
        if not sources and linked.get(row["id"]):
            sources.append({"type": "linked_project", "group": None})
        for source in sources:
            by_source[source["type"]] += 1
        items.append({"id": pid, "name": row["name"], "identifier": row["identifier"], "sources": sources})
    return {"total": len(items), "by_source": dict(by_source), "items": items}


# ---------------------------------------------------------------------------
# 权限与来源
# ---------------------------------------------------------------------------


def _grants(keys_with_sources, granted):
    """{key: [source]} → 只留实际生效的 key，按 key 排序。"""
    return [
        {"key": key, "sources": sources}
        for key, sources in sorted(keys_with_sources.items())
        if key in granted
    ]


def _workspace_group_project_sources(bindings):
    """各工作区权限组的项目 key → 来源（组 + 经哪个团队）。"""
    result = defaultdict(list)
    for role in bindings.of_kind(WorkspaceRole.KIND_WORKSPACE):
        team = bindings.team_of(role.id)
        for key in effective_payload(role)["permission_keys"]:
            if key.startswith("project."):
                result[key].append(_source("workspace_group", role, team))
    return result


def _workspace_permissions(workspace, user, bindings, passthrough):
    granted = _get_user_workspace_permission_keys(user, workspace.slug)
    sources = defaultdict(list)
    if passthrough:
        for key in granted:
            sources[key].append(_source(passthrough))
    else:
        for role in bindings.of_kind(WorkspaceRole.KIND_WORKSPACE):
            team = bindings.team_of(role.id)
            for key in effective_payload(role)["permission_keys"]:
                if key.startswith("workspace."):
                    sources[key].append(_source("workspace_group", role, team))
    return _grants(sources, granted)


def _aggregate_project_permissions(user, bindings, passthrough):
    """「全部可见项目」：工作区权限组项目 key 的并集；直通身份是全集。"""
    inactive = _inactive_keys(user)
    if passthrough:
        granted = PROJECT_KEYS - inactive
        sources = {key: [_source(passthrough)] for key in granted}
        return {
            "project": None,
            "grants": _grants(sources, granted),
            "summary": {"workspace_group": 0, "template": 0, "project_role": 0, "passthrough": len(granted)},
            "bound_groups": [],
        }
    sources = _workspace_group_project_sources(bindings)
    granted = set(sources) - inactive
    return {
        "project": None,
        "grants": _grants(sources, granted),
        "summary": {"workspace_group": len(granted), "template": 0, "project_role": 0, "passthrough": 0},
        "bound_groups": [],
    }


def build_project_my_access(workspace, user, project):
    """切到某个项目：工作区组的项目 key + 本项目绑定的模板 / 本项目组。进不了的项目返回 None。"""
    grant = resolve_project_grant(user, workspace.slug, project.id, project=project)
    if not grant.is_member:
        return None
    bindings = _Bindings(workspace, _workspace_member(workspace, user))
    project_ref = {"id": str(project.id), "name": project.name, "identifier": project.identifier}
    sources = defaultdict(list)
    summary = {"workspace_group": 0, "template": 0, "project_role": 0, "passthrough": 0}
    bound_groups = []
    if grant.passthrough:
        kind = _passthrough_type(workspace, user) or "project_lead"
        for key in grant.keys:
            sources[key].append(_source(kind))
        summary["passthrough"] = len(grant.keys)
        return {"project": project_ref, "grants": _grants(sources, grant.keys), "summary": summary, "bound_groups": bound_groups}

    ws_sources = _workspace_group_project_sources(bindings)
    for key, items in ws_sources.items():
        sources[key].extend(items)
    summary["workspace_group"] = len(set(ws_sources) & grant.keys)

    project_member = ProjectMember.objects.filter(
        member=user, project=project, is_active=True, deleted_at__isnull=True
    ).first()
    if project_member is not None:
        template_keys, local_keys = set(), set()
        for role in user_project_roles(user, project_member, project.id):
            template = role.source_template
            if template is not None:
                if not template_references_project(template, project.id, user):
                    continue
                keys = set(effective_payload(template)["permission_keys"])
                template_keys |= keys
                bound_groups.append({"id": str(template.id), "name": template.name, "source": "template"})
                for key in keys:
                    sources[key].append(_source("template", template))
            else:
                keys = set(effective_payload(role)["permission_keys"])
                local_keys |= keys
                bound_groups.append({"id": str(role.id), "name": role.name, "source": "project"})
                for key in keys:
                    sources[key].append(_source("project_role", role))
        ws_keys = set(ws_sources)
        summary["template"] = len((template_keys - ws_keys) & grant.keys)
        summary["project_role"] = len((local_keys - ws_keys - template_keys) & grant.keys)
    return {"project": project_ref, "grants": _grants(sources, grant.keys), "summary": summary, "bound_groups": bound_groups}


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------


def build_workspace_my_access(workspace, user):
    workspace_member = _workspace_member(workspace, user)
    passthrough = _passthrough_type(workspace, user)
    bindings = _Bindings(workspace, workspace_member)

    job_role_ids = (
        set(workspace_member.job_role_links.values_list("job_role_id", flat=True)) if workspace_member else set()
    )
    job_roles = [
        {"id": str(item.id), "label": item.label, "color": item.color}
        for item in job_role_items(workspace.id).filter(id__in=job_role_ids)
    ]
    led_project_count = Project.objects.filter(workspace=workspace, project_lead=user, archived_at__isnull=True).count()

    projects = _visible_projects(workspace, user, bindings, passthrough)
    visible_project_ids = {item["id"] for item in projects["items"]}
    products = _visible_products(workspace, user, bindings, passthrough, visible_project_ids)

    data_groups = []
    for role in bindings.of_kind(WorkspaceRole.KIND_DATA):
        p_scope = role_scope(role, "projects", workspace, user)
        d_scope = role_scope(role, "products", workspace, user)
        p_count = Project.objects.filter(workspace=workspace).count() if p_scope.all else len(p_scope.ids)
        d_count = Product.objects.filter(workspace=workspace).count() if d_scope.all else len(d_scope.ids)
        data_groups.append(bindings.group_payload(role, (p_count, d_count)))

    teams = [
        {
            "id": str(team.id),
            "name": team.name,
            "member_count": bindings.team_member_counts.get(team.id, 0),
            "group_ids": [str(role_id) for role_id, groups in bindings.teams_by_role.items() if team in groups],
        }
        for team in bindings.teams
    ]

    return {
        "membership": {
            "id": str(workspace_member.id) if workspace_member else None,
            "joined_at": workspace_member.created_at.isoformat() if workspace_member else None,
            "is_workspace_owner": passthrough == "workspace_owner",
            "is_instance_admin": _is_instance_admin(user),
            "led_project_count": led_project_count,
        },
        "job_roles": job_roles,
        "workspace_groups": [bindings.group_payload(role) for role in bindings.of_kind(WorkspaceRole.KIND_WORKSPACE)],
        "data_groups": data_groups,
        "teams": teams,
        "visibility": {"projects": projects, "products": products},
        "workspace_permissions": _workspace_permissions(workspace, user, bindings, passthrough),
        "project_permissions": _aggregate_project_permissions(user, bindings, passthrough),
    }
