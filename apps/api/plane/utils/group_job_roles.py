# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""权限组绑定角色（WorkspaceRoleJobRole / ProjectRoleJobRole）：绑定的维护，以及「经角色算在组里的人」的反查。

规则：权限组绑了角色，挂着这个角色的人自动拥有这个组的权限，实时计算、不落成员行。
工作区权限组 / 数据权限看工作区成员的角色；项目标准权限组、项目自定义组看成员在项目里的角色。
单向：进了权限组不会得到角色。

某个人经角色在哪些组里（鉴权用的正向判断）在 permissions/base.py；这里是设置页的增删和批量反查。
"""

from collections import defaultdict

from plane.db.models import (
    ProjectMemberJobRole,
    ProjectMemberRole,
    ProjectRole,
    ProjectRoleJobRole,
    WorkspaceMemberJobRole,
    WorkspaceMemberRole,
    WorkspaceRole,
    WorkspaceRoleJobRole,
)
from plane.utils.data_scope import excluded_project_ids
from plane.utils.job_role import validate_job_role_ids

#: 看工作区角色的两类组；项目标准权限组看项目里的角色
WORKSPACE_LEVEL_KINDS = (WorkspaceRole.KIND_WORKSPACE, WorkspaceRole.KIND_DATA)


class GroupJobRoleError(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message


# ---------------------------------------------------------------------------
# 绑定关系
# ---------------------------------------------------------------------------


def workspace_group_job_roles(workspace_id, kinds=None) -> dict:
    """{工作区里的权限组 id: [角色 id, ...]}，按绑定时间。``kinds`` 限定组的类型。"""
    queryset = WorkspaceRoleJobRole.objects.filter(workspace_id=workspace_id, role__deleted_at__isnull=True)
    if kinds:
        queryset = queryset.filter(role__kind__in=kinds)
    result = defaultdict(list)
    for role_id, job_role_id in queryset.order_by("created_at").values_list("role_id", "job_role_id"):
        result[role_id].append(job_role_id)
    return result


def project_group_job_roles(project_id) -> dict:
    """{本项目自定义组 id: [角色 id, ...]}，按绑定时间。"""
    result = defaultdict(list)
    for role_id, job_role_id in (
        ProjectRoleJobRole.objects.filter(project_id=project_id, role__deleted_at__isnull=True)
        .order_by("created_at")
        .values_list("role_id", "job_role_id")
    ):
        result[role_id].append(job_role_id)
    return result


def _links(role):
    model = WorkspaceRoleJobRole if isinstance(role, WorkspaceRole) else ProjectRoleJobRole
    return model.objects.filter(role=role)


def bind_job_roles(role, job_role_ids):
    """给权限组绑一批角色（已绑的跳过）。``role`` 是工作区里的权限组，或本项目自定义的权限组。"""
    if isinstance(role, ProjectRole) and role.source_template_id:
        raise GroupJobRoleError("项目标准权限组的角色在工作区设置里绑定。")
    valid, invalid = validate_job_role_ids(role.workspace_id, job_role_ids)
    if invalid or not valid:
        raise GroupJobRoleError("角色不存在或不属于本工作区。")
    existing = {str(value) for value in _links(role).values_list("job_role_id", flat=True)}
    model = WorkspaceRoleJobRole if isinstance(role, WorkspaceRole) else ProjectRoleJobRole
    # 按请求里的顺序逐行建：save() 才会记下绑定人，bulk_create 不会
    wanted = [str(value) for value in job_role_ids if str(value) in valid]
    for job_role_id in dict.fromkeys(wanted):
        if job_role_id not in existing:
            model.objects.create(role=role, job_role_id=job_role_id, workspace_id=role.workspace_id)


def unbind_job_role(role, job_role_id):
    _links(role).filter(job_role_id=job_role_id).delete(soft=False)


# ---------------------------------------------------------------------------
# 谁挂着角色
# ---------------------------------------------------------------------------


def workspace_job_role_holders(workspace_id, job_role_ids=None) -> dict:
    """{角色 id: [(工作区成员行 id, 用户 id), ...]}：活跃的工作区成员。"""
    queryset = WorkspaceMemberJobRole.objects.filter(
        workspace_id=workspace_id, member__is_active=True, member__deleted_at__isnull=True
    )
    if job_role_ids is not None:
        queryset = queryset.filter(job_role_id__in=list(job_role_ids))
    result = defaultdict(list)
    for job_role_id, member_id, user_id in queryset.order_by("created_at").values_list(
        "job_role_id", "member_id", "member__member_id"
    ):
        result[job_role_id].append((member_id, user_id))
    return result


def project_job_role_holders(project_id, job_role_ids=None) -> dict:
    """{角色 id: [用户 id, ...]}：本项目的活跃成员。"""
    queryset = ProjectMemberJobRole.objects.filter(
        project_id=project_id, member__is_active=True, member__deleted_at__isnull=True
    )
    if job_role_ids is not None:
        queryset = queryset.filter(job_role_id__in=list(job_role_ids))
    result = defaultdict(list)
    for job_role_id, user_id in queryset.order_by("created_at").values_list("job_role_id", "member__member_id"):
        result[job_role_id].append(user_id)
    return result


def workspace_job_role_user_ids(workspace_id, role_ids) -> set:
    """经角色算在这些工作区权限组 / 数据权限里的人（用户 id）。"""
    wanted = set(role_ids)
    job_role_ids = {
        job_role_id
        for role_id, ids in workspace_group_job_roles(workspace_id, WORKSPACE_LEVEL_KINDS).items()
        if role_id in wanted
        for job_role_id in ids
    }
    if not job_role_ids:
        return set()
    holders = workspace_job_role_holders(workspace_id, job_role_ids)
    return {user_id for pairs in holders.values() for _, user_id in pairs}


# ---------------------------------------------------------------------------
# 组的成员 = 直接添加 ∪ 经角色
# ---------------------------------------------------------------------------


def merge_members(direct_user_ids, job_role_ids, holders) -> list:
    """[{"id": 用户 id, "is_direct", "job_role_ids"}]：直接添加的在前，各自保持原顺序；一个人只出现一次。
    ``holders`` 是 {角色 id: [用户 id]}。"""
    members = {}
    for user_id in direct_user_ids:
        members.setdefault(str(user_id), {"id": str(user_id), "is_direct": True, "job_role_ids": []})
    for job_role_id in job_role_ids:
        for user_id in holders.get(job_role_id, ()):
            entry = members.setdefault(str(user_id), {"id": str(user_id), "is_direct": False, "job_role_ids": []})
            if str(job_role_id) not in entry["job_role_ids"]:
                entry["job_role_ids"].append(str(job_role_id))
    return list(members.values())


def workspace_group_members(role) -> list:
    """工作区权限组 / 数据权限详情「成员」页签。"""
    direct = (
        WorkspaceMemberRole.objects.filter(role=role, member__is_active=True, member__deleted_at__isnull=True)
        .order_by("created_at")
        .values_list("member__member_id", flat=True)
    )
    job_role_ids = list(_links(role).order_by("created_at").values_list("job_role_id", flat=True))
    holders = {}
    if job_role_ids and role.kind in WORKSPACE_LEVEL_KINDS:
        holders = {
            job_role_id: [user_id for _, user_id in pairs]
            for job_role_id, pairs in workspace_job_role_holders(role.workspace_id, job_role_ids).items()
        }
    return merge_members(direct, job_role_ids, holders)


def project_group_members(project, row, template) -> list:
    """项目权限组详情「成员」页签。``row`` 是项目里的行（标准权限组还没人直接分配时为 None），
    ``template`` 非空 = 标准权限组，角色跟模板走。"""
    direct = (
        ProjectMemberRole.objects.filter(role=row, member__is_active=True, member__deleted_at__isnull=True)
        .order_by("created_at")
        .values_list("member__member_id", flat=True)
        if row is not None
        else []
    )
    source = template if template is not None else row
    job_role_ids = list(_links(source).order_by("created_at").values_list("job_role_id", flat=True)) if source else []
    holders = project_job_role_holders(project.id, job_role_ids) if job_role_ids else {}
    return merge_members(direct, job_role_ids, holders)


# ---------------------------------------------------------------------------
# 详情「角色」页签
# ---------------------------------------------------------------------------


def _row(link, user_ids, project_count=None):
    user_ids = list(dict.fromkeys(str(value) for value in user_ids))
    return {
        "id": str(link.job_role_id),
        "label": link.job_role.label,
        "color": link.job_role.color,
        "member_count": len(user_ids),
        "member_preview_ids": user_ids[:3],
        "project_count": project_count,
        "created_at": link.created_at,
        "created_by_id": str(link.created_by_id) if link.created_by_id else None,
    }


def workspace_group_job_role_rows(role) -> list:
    """工作区设置里权限组详情的「角色」页签。工作区权限组 / 数据权限：挂这个角色的工作区成员；
    项目标准权限组：各引用项目里挂这个角色的项目成员（人数去重）与涉及的项目数。"""
    links = list(_links(role).select_related("job_role").order_by("created_at"))
    job_role_ids = [link.job_role_id for link in links]
    if not links:
        return []
    if role.kind in WORKSPACE_LEVEL_KINDS:
        holders = workspace_job_role_holders(role.workspace_id, job_role_ids)
        return [_row(link, [user_id for _, user_id in holders.get(link.job_role_id, ())]) for link in links]
    users, projects = defaultdict(list), defaultdict(set)
    for job_role_id, project_id, user_id in (
        ProjectMemberJobRole.objects.filter(
            workspace_id=role.workspace_id,
            job_role_id__in=job_role_ids,
            member__is_active=True,
            member__deleted_at__isnull=True,
            project__deleted_at__isnull=True,
        )
        .exclude(project_id__in=list(excluded_project_ids(role)))
        .order_by("created_at")
        .values_list("job_role_id", "project_id", "member__member_id")
    ):
        users[job_role_id].append(user_id)
        projects[job_role_id].add(project_id)
    return [_row(link, users.get(link.job_role_id, ()), len(projects.get(link.job_role_id, ()))) for link in links]


def project_group_job_role_rows(project, row, template) -> list:
    """项目里权限组详情的「角色」页签：本项目里挂这个角色的成员。标准权限组的角色跟模板走（只读）。"""
    source = template if template is not None else row
    if source is None:
        return []
    links = list(_links(source).select_related("job_role").order_by("created_at"))
    holders = project_job_role_holders(project.id, [link.job_role_id for link in links]) if links else {}
    return [_row(link, holders.get(link.job_role_id, ())) for link in links]
