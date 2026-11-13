# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""权限解析（docs/permission-refactor/permission-keys.md）。

一个人的权限 = 直通身份 + 他所在权限组的 key 并集，按三层算：

- 工作区：工作区 owner / 实例管理员直通；否则 = 直绑的工作区权限组 ∪ 所在团队绑的
  工作区权限组，取 workspace.* 部分。没绑任何组的成员只有「是成员」这一身份，没有 key。
- 项目：实例管理员 / 工作区 owner / 项目负责人（负责人为空时回退创建人）直通；否则
  本项目绑的组（直绑 + 团队授权；引用行要求模板仍引用本项目）∪ 白名单含本项目的工作区权限组的
  project.* 部分。项目在某个组的白名单里但自己不是成员（「白名单访客」）也算能进，权限只有后一半。
  可见范围（成员 ∪ 负责 ∪ 白名单并集）在 utils/visibility.py，白名单求值在 utils/data_scope.py。
- 没有系统组：所有权限组都是普通的、可配的；成员不默认属于任何组。
- 产品：没有自己的 key。直通身份 / 产品负责人拿全部项目 key；其余人 = 该产品各活跃关联项目里的
  项目 key 并集。``workspace.product.edit`` 只管产品基本信息，不带需求 / 用例等内容权限。

按工作项类型限定：权限组 JSON ``type_limits`` 记「这个动作不适用于哪些类型」，只对
工作项 / 缺陷的新建、编辑、删除生效；多个组取并集 = 排除清单取交集。

同一请求内的结果缓存在 user 对象上（它的生命周期就是一次请求）。
"""

from enum import Enum
from functools import wraps
from typing import Iterable, Optional

from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.response import Response

from plane.db.models import (
    IssueType,
    Permission,
    Product,
    ProductProject,
    Project,
    ProjectGroupRole,
    ProjectMember,
    ProjectMemberRole,
    ProjectRole,
    TestCaseRepository,
    Workspace,
    WorkspaceMember,
    WorkspaceMemberRole,
    WorkspaceRole,
)
from plane.license.models import Instance, InstanceAdmin

from .keys import PermissionKey
from .registry import PROJECT_KEYS, TYPE_LIMITABLE_KEYS, WORKSPACE_KEYS


#: 工作项类型的类别名为「缺陷」时，鉴权走 project.defect.*，其余走 project.issue.*
DEFECT_CATEGORY_NAME = "缺陷"

#: 工作项的 archive / unarchive 都看 project.issue.archive（缺陷没有单独的归档权限）
_ISSUE_ACTIONS = ("create", "edit", "delete", "archive", "unarchive")


def _normalize_keys(permission_keys) -> set:
    return {key.value if isinstance(key, Enum) else str(key) for key in permission_keys}


# ---------------------------------------------------------------------------
# 请求级缓存
# ---------------------------------------------------------------------------


def _cache(user) -> dict:
    cache = getattr(user, "_plane_perm_cache", None)
    if cache is None:
        cache = {}
        try:
            user._plane_perm_cache = cache
        except AttributeError:
            # AnonymousUser 等不可写对象不缓存
            pass
    return cache


def _is_anonymous(user) -> bool:
    return not user or getattr(user, "is_anonymous", True)


def _is_instance_admin(user) -> bool:
    cache = _cache(user)
    if "instance_admin" in cache:
        return cache["instance_admin"]
    instance = Instance.objects.first()
    result = bool(instance) and InstanceAdmin.objects.filter(instance=instance, user=user).exists()
    cache["instance_admin"] = result
    return result


def _inactive_keys(user) -> frozenset:
    """管理员在权限字典里停用的 key，三层解析都剔除。"""
    cache = _cache(user)
    if "inactive_keys" not in cache:
        cache["inactive_keys"] = frozenset(
            Permission.objects.filter(is_active=False, deleted_at__isnull=True).values_list("key", flat=True)
        )
    return cache["inactive_keys"]


# ---------------------------------------------------------------------------
# 权限组内容
# ---------------------------------------------------------------------------


class Grant:
    """一组 key 加每个 key 的类型排除清单。"""

    __slots__ = ("keys", "excluded", "is_member", "passthrough")

    def __init__(self, keys=frozenset(), excluded=None, is_member=False, passthrough=False):
        self.keys = frozenset(keys)
        self.excluded = excluded or {}
        self.is_member = is_member
        self.passthrough = passthrough

    def allows(self, key, type_ids: Iterable = ()) -> bool:
        key = key.value if isinstance(key, Enum) else str(key)
        if key not in self.keys:
            return False
        excluded = self.excluded.get(key)
        if not excluded:
            return True
        return not any(str(type_id) in excluded for type_id in type_ids if type_id)

    def type_limits(self) -> dict:
        return {key: sorted(ids) for key, ids in self.excluded.items() if ids}


EMPTY_GRANT = Grant()


def role_payload(permissions, scope_keys):
    """权限组 JSON → (key 集合, {key: 排除的类型 id 集合})，只取 ``scope_keys`` 里的 key。"""
    perms = permissions if isinstance(permissions, dict) else {}
    keys = {key for key in perms.get("permission_keys", []) if isinstance(key, str) and key in scope_keys}
    limits = {}
    raw_limits = perms.get("type_limits")
    if isinstance(raw_limits, dict):
        for key, type_ids in raw_limits.items():
            if key in keys and key in TYPE_LIMITABLE_KEYS and isinstance(type_ids, list):
                limits[key] = {str(type_id) for type_id in type_ids if type_id}
    return keys, limits


def combine_payloads(payloads) -> tuple:
    """多个组取并集：key 并集，同一个 key 的排除清单取交集（任一组没限定就不限定）。"""
    keys: set = set()
    excluded: dict = {}
    for payload_keys, payload_limits in payloads:
        for key in payload_keys:
            limit = frozenset(payload_limits.get(key, ())) if key in TYPE_LIMITABLE_KEYS else frozenset()
            excluded[key] = excluded[key] & limit if key in keys else limit
            keys.add(key)
    return keys, {key: ids for key, ids in excluded.items() if ids}


def project_role_payload(project_role):
    """项目权限组：引用行取模板，自定义行取本行。"""
    template = project_role.source_template
    if template is not None and template.deleted_at is None:
        return role_payload(template.permissions, PROJECT_KEYS)
    return role_payload(project_role.permissions, PROJECT_KEYS)


# ---------------------------------------------------------------------------
# 工作区
# ---------------------------------------------------------------------------


class _WorkspaceContext:
    __slots__ = ("workspace", "is_member", "passthrough", "keys", "project_payloads")

    def __init__(self, workspace, is_member=False, passthrough=False, keys=frozenset(), project_payloads=()):
        self.workspace = workspace
        self.is_member = is_member
        self.passthrough = passthrough
        self.keys = frozenset(keys)
        # 各工作区权限组（kind=workspace）的 project.* 部分：(key 集合, 类型限定)。
        # 在此人能看到的所有项目上生效（能看到哪些由 utils/visibility.py 决定）。
        self.project_payloads = tuple(project_payloads)


def _get_workspace(workspace_or_slug, user=None):
    """传 ``user`` 时按 slug 查到的工作区记进请求级缓存：一次请求里可见范围会被问几十次，
    不必每次都查一遍 workspaces。查不到的不缓存。"""
    if isinstance(workspace_or_slug, Workspace):
        return workspace_or_slug
    if not workspace_or_slug:
        return None
    if _is_anonymous(user):
        return Workspace.objects.filter(slug=workspace_or_slug).first()
    cache = _cache(user)
    cache_key = ("workspace_by_slug", workspace_or_slug)
    workspace = cache.get(cache_key)
    if workspace is None:
        workspace = Workspace.objects.filter(slug=workspace_or_slug).first()
        if workspace is not None:
            cache[cache_key] = workspace
    return workspace


def user_workspace_groups(user, workspace, workspace_member):
    """此人在工作区绑定的权限组（工作区权限组 + 数据权限，模板不会出现）：直绑 + 团队绑定。"""
    direct_ids = WorkspaceMemberRole.objects.filter(
        member=workspace_member,
        workspace=workspace,
        deleted_at__isnull=True,
    ).values_list("role_id", flat=True)
    team_ids = WorkspaceRole.objects.filter(
        workspace=workspace,
        role_groups__deleted_at__isnull=True,
        role_groups__group__workspace=workspace,
        role_groups__group__deleted_at__isnull=True,
        role_groups__group__group_members__deleted_at__isnull=True,
        role_groups__group__group_members__member=workspace_member,
    ).values_list("id", flat=True)
    return list(
        WorkspaceRole.objects.filter(workspace=workspace, deleted_at__isnull=True)
        .filter(id__in=set(direct_ids) | set(team_ids))
        .distinct()
    )


def workspace_context(user, workspace_or_slug) -> _WorkspaceContext:
    workspace = _get_workspace(workspace_or_slug, user)
    if workspace is None or _is_anonymous(user):
        return _WorkspaceContext(workspace)
    cache = _cache(user)
    cache_key = ("workspace", workspace.id)
    if cache_key in cache:
        return cache[cache_key]

    inactive = _inactive_keys(user)
    if workspace.owner_id == user.id or _is_instance_admin(user):
        context = _WorkspaceContext(
            workspace,
            is_member=True,
            passthrough=True,
            keys=WORKSPACE_KEYS - inactive,
            project_payloads=[(set(PROJECT_KEYS), {})],
        )
        cache[cache_key] = context
        return context

    workspace_member = WorkspaceMember.objects.filter(
        member=user, workspace=workspace, is_active=True, deleted_at__isnull=True
    ).first()
    if workspace_member is None:
        context = _WorkspaceContext(workspace)
        cache[cache_key] = context
        return context

    workspace_payloads, project_payloads = [], []
    for role in user_workspace_groups(user, workspace, workspace_member):
        if role.kind != WorkspaceRole.KIND_WORKSPACE:
            # 数据权限只管可见范围（utils/visibility.py），没有 key
            continue
        workspace_payloads.append(role_payload(role.permissions, WORKSPACE_KEYS))
        project_payloads.append(role_payload(role.permissions, PROJECT_KEYS))
    keys, _ = combine_payloads(workspace_payloads)
    context = _WorkspaceContext(
        workspace,
        is_member=True,
        keys=keys - inactive,
        project_payloads=project_payloads,
    )
    cache[cache_key] = context
    return context


def _get_user_workspace_permission_keys(user, workspace_slug) -> set:
    return set(workspace_context(user, workspace_slug).keys)


def is_workspace_member(user, workspace_slug) -> bool:
    return workspace_context(user, workspace_slug).is_member


def is_workspace_owner(user, workspace_slug) -> bool:
    workspace = _get_workspace(workspace_slug, user)
    return bool(workspace) and not _is_anonymous(user) and (
        workspace.owner_id == user.id or _is_instance_admin(user)
    )


def has_workspace_permission(user, slug, *permission_keys) -> bool:
    """持有任一指定 workspace.* key 即 True。直通（owner / 实例管理员）在 key 解析里。"""
    wanted = _normalize_keys(permission_keys)
    return bool(wanted) and bool(workspace_context(user, slug).keys & wanted)


# ---------------------------------------------------------------------------
# 项目
# ---------------------------------------------------------------------------


def _load_project(project_id, project=None):
    if project is not None:
        return project
    if not project_id:
        return None
    try:
        return Project.objects.select_related("workspace").filter(pk=project_id).first()
    except (ValueError, ValidationError):
        return None


def user_project_roles(user, project_member, project_id):
    """此人在项目里绑定的项目权限组（直绑 + 团队授权），带模板。"""
    direct_ids = ProjectMemberRole.objects.filter(
        member=project_member, deleted_at__isnull=True
    ).values_list("role_id", flat=True)
    team_ids = ProjectGroupRole.objects.filter(
        project_id=project_id,
        deleted_at__isnull=True,
        group__deleted_at__isnull=True,
        group__group_members__deleted_at__isnull=True,
        group__group_members__member__deleted_at__isnull=True,
        group__group_members__member__is_active=True,
        group__group_members__member__member=user,
    ).values_list("role_id", flat=True)
    return list(
        ProjectRole.objects.filter(
            pk__in=set(direct_ids) | set(team_ids), project_id=project_id, deleted_at__isnull=True
        ).select_related("source_template")
    )


def is_project_passthrough(user, project) -> bool:
    if _is_anonymous(user) or project is None:
        return False
    if _is_instance_admin(user) or project.workspace.owner_id == user.id:
        return True
    if project.project_lead_id:
        return project.project_lead_id == user.id
    return project.created_by_id == user.id


def resolve_project_grant(user, workspace_slug, project_id, *, project=None) -> Grant:
    if _is_anonymous(user):
        return EMPTY_GRANT
    project = _load_project(project_id, project)
    if project is None:
        return EMPTY_GRANT
    if workspace_slug and project.workspace.slug != workspace_slug:
        return EMPTY_GRANT
    cache = _cache(user)
    cache_key = ("project", project.id)
    if cache_key in cache:
        return cache[cache_key]

    inactive = _inactive_keys(user)
    if is_project_passthrough(user, project):
        grant = Grant(PROJECT_KEYS - inactive, is_member=True, passthrough=True)
        cache[cache_key] = grant
        return grant

    context = workspace_context(user, project.workspace)
    if not context.is_member:
        cache[cache_key] = EMPTY_GRANT
        return EMPTY_GRANT
    from plane.utils.data_scope import template_references_project
    from plane.utils.visibility import can_access_project

    # 能不能进：成员 / 负责人 / 数据权限白名单含本项目（白名单访客）；进不了就什么都没有
    if not can_access_project(user, project.workspace, project.id):
        cache[cache_key] = EMPTY_GRANT
        return EMPTY_GRANT
    project_member = ProjectMember.objects.filter(
        member=user, project_id=project.id, is_active=True, deleted_at__isnull=True
    ).first()

    # 工作区权限组的项目 key 在所有能进的项目上生效
    payloads = list(context.project_payloads)
    if project_member is not None:
        for role in user_project_roles(user, project_member, project.id):
            # 引用行：模板不再引用本项目（被排除）时不生效
            if role.source_template_id and not template_references_project(role.source_template, project.id, user):
                continue
            payloads.append(project_role_payload(role))

    keys, excluded = combine_payloads(payloads)
    grant = Grant(keys - inactive, excluded, is_member=True)
    cache[cache_key] = grant
    return grant


def bulk_project_permission_keys(user, workspace, project_ids, wanted_keys) -> dict:
    """列表页一次算一批项目里的少数几个 key（{项目 id: key 集合}），不逐个项目走 resolve_project_grant。
    规则与 resolve_project_grant 相同，只是不算类型限定。"""
    wanted = frozenset(wanted_keys)
    project_ids = [str(value) for value in project_ids]
    result = {project_id: set() for project_id in project_ids}
    context = workspace_context(user, workspace)
    if not context.is_member or not project_ids:
        return result
    from plane.utils.data_scope import template_references_project
    from plane.utils.visibility import visible_project_scope

    inactive = _inactive_keys(user)
    projects = {
        str(row["id"]): row
        for row in Project.objects.filter(pk__in=project_ids).values("id", "project_lead_id", "created_by_id")
    }
    if context.passthrough:
        # 直通（实例管理员 / 工作区 owner）：全部 key，不必再拉成员、角色、团队、模板
        for project_id in projects:
            result[project_id] = set(wanted - inactive)
        return result
    member_rows = {
        str(row["project_id"]): row["id"]
        for row in ProjectMember.objects.filter(
            member=user, project_id__in=project_ids, is_active=True, deleted_at__isnull=True
        ).values("id", "project_id")
    }
    # 工作区权限组的项目 key 并集，在所有能进的项目上生效
    group_keys = set()
    for keys, _ in context.project_payloads:
        group_keys |= set(keys)
    visible = visible_project_scope(user, workspace)

    role_keys_by_project = {}
    role_ids_by_project = {}
    for member_id, role_id, project_id in ProjectMemberRole.objects.filter(
        member_id__in=list(member_rows.values()), deleted_at__isnull=True
    ).values_list("member_id", "role_id", "project_id"):
        role_ids_by_project.setdefault(str(project_id), set()).add(role_id)
    for project_id, role_id in ProjectGroupRole.objects.filter(
        project_id__in=list(member_rows),
        deleted_at__isnull=True,
        group__deleted_at__isnull=True,
        group__group_members__deleted_at__isnull=True,
        group__group_members__member__is_active=True,
        group__group_members__member__member=user,
    ).values_list("project_id", "role_id"):
        role_ids_by_project.setdefault(str(project_id), set()).add(role_id)
    all_role_ids = {role_id for ids in role_ids_by_project.values() for role_id in ids}
    roles = {
        role.id: role
        for role in ProjectRole.objects.filter(pk__in=all_role_ids).select_related("source_template")
    }
    for project_id, ids in role_ids_by_project.items():
        keys = set()
        for role_id in ids:
            role = roles.get(role_id)
            if role is None:
                continue
            if role.source_template_id and not template_references_project(role.source_template, project_id, user):
                continue
            keys |= project_role_payload(role)[0]
        role_keys_by_project[project_id] = keys

    for project_id in project_ids:
        row = projects.get(project_id)
        if row is None:
            continue
        lead = row["project_lead_id"]
        is_lead = (lead == user.id) if lead else row["created_by_id"] == user.id
        if is_lead:
            result[project_id] = set(wanted - inactive)
            continue
        if not visible.contains(project_id):
            continue
        keys = set(group_keys)
        if project_id in member_rows:
            keys |= role_keys_by_project.get(project_id, set())
        result[project_id] = (keys & wanted) - inactive
    return result


def _get_user_project_permission_keys(user, workspace_slug, project_id, *, project=None, role_ids=None) -> set:
    """兼容旧调用：只要 key 集合。``role_ids`` 已不再使用。"""
    return set(resolve_project_grant(user, workspace_slug, project_id, project=project).keys)


def is_project_member(user, workspace_slug, project_id, *, project=None) -> bool:
    """能进这个项目：活跃成员、直通身份，或项目在他某个数据权限的白名单里（白名单访客）。
    名字沿用，语义是「可进」而不是「成员表里有他」；真成员看 ProjectMember。"""
    return resolve_project_grant(user, workspace_slug, project_id, project=project).is_member


def get_project_from_qa(request):
    """测试模块的部分接口不带 project_id，从用例库反查。"""
    repository_id = (
        request.query_params.get("repository_id")
        or request.data.get("repository_id")
        or request.query_params.get("repository")
        or request.data.get("repository")
    )
    if not repository_id:
        return ""
    try:
        return TestCaseRepository.objects.filter(pk=repository_id).values_list("project_id", flat=True).first() or ""
    except (ValueError, ValidationError):
        return ""


def _project_id_from_request(request, kwargs):
    project_id = str(kwargs.get("project_id", "")) or str(kwargs.get("pk", "")) or request.query_params.get(
        "project_id", ""
    )
    return project_id or get_project_from_qa(request)


# ---------------------------------------------------------------------------
# 工作项（按类型判工作项 / 缺陷，并看类型限定）
# ---------------------------------------------------------------------------


def issue_type_permission_info(user, issue_type_id):
    """(模块, 用于类型限定比对的 id 集合)。类型库类型的 id 与项目方案副本指回库类型的 id 都算。"""
    if not issue_type_id:
        return "project.issue", ()
    cache = _cache(user)
    cache_key = ("issue_type", str(issue_type_id))
    if cache_key not in cache:
        try:
            row = (
                IssueType.all_objects.filter(pk=issue_type_id)
                .values("id", "library_type_id", "category__name")
                .first()
            )
        except (ValueError, ValidationError):
            row = None
        if row is None:
            cache[cache_key] = ("project.issue", ())
        else:
            module = "project.defect" if row["category__name"] == DEFECT_CATEGORY_NAME else "project.issue"
            ids = tuple(str(value) for value in (row["id"], row["library_type_id"]) if value)
            cache[cache_key] = (module, ids)
    return cache[cache_key]


def issue_permission_key(module: str, action: str) -> str:
    if action == "unarchive":
        action = "archive"
    if action == "archive":
        return PermissionKey.PROJECT_ISSUE_ARCHIVE.value
    return f"{module}.{action}"


def has_project_issue_permission(
    user,
    workspace_slug: str,
    project_id: str,
    action: str,
    issue_type_id: Optional[str] = None,
    issue_assignee_ids: Optional[Iterable] = None,
) -> bool:
    """工作项的写动作：按类型选 project.issue / project.defect，再看类型限定。
    负责人改自己负责的工作项不看 key（``issue_assignee_ids`` 为 None 时不走这条）。"""
    if action not in _ISSUE_ACTIONS:
        raise ValueError(f"Unsupported issue permission action: {action}")
    if action == "edit" and issue_assignee_ids is not None and user.pk in issue_assignee_ids:
        return True
    module, type_ids = issue_type_permission_info(user, issue_type_id)
    grant = resolve_project_grant(user, workspace_slug, project_id)
    return grant.allows(issue_permission_key(module, action), type_ids)


def resolve_project_issue_type_name(project_id: str, issue_type_id: str) -> Optional[str]:
    """类型 id 是否属于项目可用的方案，找不到返回 None。"""
    issue_type = IssueType.objects.filter(
        scheme__projects=project_id, id=issue_type_id, deleted_at__isnull=True
    ).first()
    return issue_type.name if issue_type else None


# ---------------------------------------------------------------------------
# 产品（内容权限来自关联项目）
# ---------------------------------------------------------------------------


def linked_project_ids(product) -> list:
    return list(
        ProductProject.objects.filter(
            product=product,
            deleted_at__isnull=True,
            project__deleted_at__isnull=True,
            project__archived_at__isnull=True,
        ).values_list("project_id", flat=True)
    )


def _get_user_product_permission_keys(user, product) -> set:
    """产品上生效的 key：workspace.* 部分照工作区，project.* 部分取各关联项目的并集。
    project.* 全开只给直通身份和产品负责人；workspace.product.edit 只管产品基本信息，
    不再连带产品里的需求 / 用例等内容权限（2026-11-04）。"""
    if _is_anonymous(user) or product is None:
        return set()
    cache = _cache(user)
    cache_key = ("product", product.id)
    if cache_key in cache:
        return cache[cache_key]
    context = workspace_context(user, product.workspace)
    if not context.is_member:
        cache[cache_key] = set()
        return set()
    keys = set(context.keys)
    if product.owner_id == user.id:
        # 产品负责人能改自己产品的基本信息（删产品仍看 workspace.product.delete）
        keys.add(PermissionKey.WORKSPACE_PRODUCT_EDIT.value)
    if context.passthrough or product.owner_id == user.id:
        keys |= PROJECT_KEYS - _inactive_keys(user)
    else:
        for project_id in linked_project_ids(product):
            grant = resolve_project_grant(user, None, project_id)
            if grant.is_member:
                keys |= grant.keys
    cache[cache_key] = keys
    return keys


def is_product_linked_member(user, product) -> bool:
    for project_id in linked_project_ids(product):
        if resolve_project_grant(user, None, project_id).is_member:
            return True
    return False


def _resolve_product_for_request(request, slug: str, kwargs: dict):
    """PRODUCT 级装饰器的产品解析：URL 的 product_id → URL 的 pk（ProductViewSet 自身路由）
    → 请求体的 product。产品必须属于 slug 工作区。"""
    product_id = (
        str(kwargs.get("product_id", ""))
        or str(kwargs.get("pk", ""))
        or str(request.data.get("product", "") or "")
    )
    if not product_id:
        return None
    try:
        return Product.objects.filter(pk=product_id, workspace__slug=slug).select_related("workspace").first()
    except (ValueError, ValidationError):
        return None


# ---------------------------------------------------------------------------
# 方案级路由（模板中心维护类型库的状态 / 工作流 / 字段）
# ---------------------------------------------------------------------------

_FINE_PERMISSION_LEVELS = ("WORKSPACE", "PROJECT", "PRODUCT")

#: 方案级路由的 URL 参数：模板中心维护模式方案时，工作项配置接口挂在
#: workspaces/<slug>/issue-schemes/<issue_scheme_id>/ 下，与项目级同名接口共用视图（docs/issue-scheme/ 4.2）
ISSUE_SCHEME_ROUTE_KWARG = "issue_scheme_id"


def is_issue_scheme_route(kwargs) -> bool:
    return bool(kwargs.get(ISSUE_SCHEME_ROUTE_KWARG)) and not kwargs.get("project_id")


def check_issue_scheme_route_permission(request, kwargs):
    """方案级路由的鉴权，返回 None 放行，否则返回 Response。
    读要 workspace.issue_scheme.view（或 manage），写要 manage；视图上声明的项目级 key 在这里不看。"""
    from rest_framework.permissions import SAFE_METHODS

    from plane.db.models import IssueScheme

    slug = kwargs.get("slug", "")
    if not IssueScheme.objects.filter(
        pk=kwargs.get(ISSUE_SCHEME_ROUTE_KWARG), workspace__slug=slug, project__isnull=True
    ).exists():
        return Response({"error": "Issue scheme not found."}, status=status.HTTP_404_NOT_FOUND)
    needed = {PermissionKey.WORKSPACE_ISSUE_SCHEME_MANAGE.value}
    if request.method in SAFE_METHODS:
        needed.add(PermissionKey.WORKSPACE_ISSUE_SCHEME_VIEW.value)
    if workspace_context(request.user, slug).keys & needed:
        return None
    return Response(
        {"error": "You don't have the required workspace permissions."},
        status=status.HTTP_403_FORBIDDEN,
    )


# ---------------------------------------------------------------------------
# 装饰器
# ---------------------------------------------------------------------------

WORKSPACE_DENIED = "You don't have the required workspace permissions."
PROJECT_DENIED = "您没有所需的项目权限。"
PRODUCT_DENIED = "您没有所需的产品权限。"


def allow_fine_permission(*permission_keys, level: str = "PROJECT"):
    """持有任一指定 key 即放行。

      @allow_fine_permission(PermissionKey.PROJECT_CYCLE_EDIT)                         # 项目级（默认）
      @allow_fine_permission(PermissionKey.WORKSPACE_MEMBER_MANAGE, level="WORKSPACE")
      @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_EDIT, level="PRODUCT")  # 产品内容
    """
    if level not in _FINE_PERMISSION_LEVELS:
        raise ValueError(f"allow_fine_permission: unknown level {level!r}, expected one of {_FINE_PERMISSION_LEVELS}")
    wanted = _normalize_keys(permission_keys)

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(instance, request, *args, **kwargs):
            slug = kwargs.get("slug", "")
            if level == "PROJECT" and is_issue_scheme_route(kwargs):
                denied = check_issue_scheme_route_permission(request, kwargs)
                return denied or view_func(instance, request, *args, **kwargs)
            if level == "WORKSPACE":
                user_keys = workspace_context(request.user, slug).keys
                request._plane_workspace_permission_keys = set(user_keys)
                error_msg = WORKSPACE_DENIED
            elif level == "PRODUCT":
                product = _resolve_product_for_request(request, slug, kwargs)
                if product is None:
                    return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
                user_keys = _get_user_product_permission_keys(request.user, product)
                error_msg = PRODUCT_DENIED
            else:
                user_keys = resolve_project_grant(request.user, slug, _project_id_from_request(request, kwargs)).keys
                error_msg = PROJECT_DENIED
            if user_keys & wanted:
                return view_func(instance, request, *args, **kwargs)
            return Response({"error": error_msg}, status=status.HTTP_403_FORBIDDEN)

        return _wrapped_view

    return decorator


def allow_project_member(view_func):
    """能进项目即可（活跃成员、直通身份、白名单访客）。方案级路由按工作项方案权限判。"""

    @wraps(view_func)
    def _wrapped_view(instance, request, *args, **kwargs):
        if is_issue_scheme_route(kwargs):
            denied = check_issue_scheme_route_permission(request, kwargs)
            return denied or view_func(instance, request, *args, **kwargs)
        if is_project_member(request.user, kwargs.get("slug", ""), _project_id_from_request(request, kwargs)):
            return view_func(instance, request, *args, **kwargs)
        return Response({"error": "You must be a member of this project."}, status=status.HTTP_403_FORBIDDEN)

    return _wrapped_view


def allow_workspace_member(view_func):
    """工作区活跃成员即可，不看业务权限。"""

    @wraps(view_func)
    def _wrapped_view(instance, request, *args, **kwargs):
        if is_workspace_member(request.user, kwargs.get("slug", "")):
            return view_func(instance, request, *args, **kwargs)
        return Response({"error": "You must be an active workspace member."}, status=status.HTTP_403_FORBIDDEN)

    return _wrapped_view


def allow_workspace_owner(view_func):
    """只有工作区 owner（和实例管理员）。"""

    @wraps(view_func)
    def _wrapped_view(instance, request, *args, **kwargs):
        if is_workspace_owner(request.user, kwargs.get("slug", "")):
            return view_func(instance, request, *args, **kwargs)
        return Response({"error": "Only the workspace owner can do this."}, status=status.HTTP_403_FORBIDDEN)

    return _wrapped_view


def allow_creator_or(*permission_keys, model, level="PROJECT", pk_kwarg="pk"):
    """创建人本人直接放行（仍须是项目 / 工作区成员）；其他人要持有任一指定 key。不给 key 就只有创建人。"""
    wanted = _normalize_keys(permission_keys)

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(instance, request, *args, **kwargs):
            slug = kwargs.get("slug", "")
            if level == "WORKSPACE":
                context = workspace_context(request.user, slug)
                is_member, keys = context.is_member, context.keys
            else:
                grant = resolve_project_grant(request.user, slug, _project_id_from_request(request, kwargs))
                is_member, keys = grant.is_member, grant.keys
            if not is_member:
                return Response({"error": "You don't have the required permissions."}, status=status.HTTP_403_FORBIDDEN)
            object_id = kwargs.get(pk_kwarg)
            if object_id and model.objects.filter(id=object_id, created_by=request.user).exists():
                return view_func(instance, request, *args, **kwargs)
            if wanted and keys & wanted:
                return view_func(instance, request, *args, **kwargs)
            return Response({"error": "You don't have the required permissions."}, status=status.HTTP_403_FORBIDDEN)

        return _wrapped_view

    return decorator


def allow_workspace_self_or_permission(permission_key, user_kwarg="user_id"):
    """看自己的数据只要是工作区成员；看别人的要指定的工作区 key。"""
    wanted = _normalize_keys([permission_key])

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(instance, request, *args, **kwargs):
            slug = kwargs.get("slug", "")
            context = workspace_context(request.user, slug)
            if str(kwargs.get(user_kwarg)) == str(request.user.id) and context.is_member:
                return view_func(instance, request, *args, **kwargs)
            if context.keys & wanted:
                return view_func(instance, request, *args, **kwargs)
            return Response({"error": WORKSPACE_DENIED}, status=status.HTTP_403_FORBIDDEN)

        return _wrapped_view

    return decorator
