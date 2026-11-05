"""可见范围（docs/permission-refactor/split-plan.md §1.1）：一个人能看到、能进哪些项目 / 产品。

可见项目 = 直通（实例管理员 / 工作区 owner → 全部）∪ 自己是活跃成员的 ∪ 自己负责的 ∪ 所在各「数据权限」的项目白名单并集
可见产品 = 直通 ∪ 负责人 ∪ 评审人 ∪ 可见项目关联的产品 ∪ 各「数据权限」的产品白名单并集

硬门禁：所有跨项目的查询（搜索、工作区视图、分析、工时、收藏、公开 API……）都用这里的 Q 收窄，
不可见的项目直接访问任何接口都是 403。结果按请求缓存在 user 对象上。
"""

from django.db.models import Q

from plane.app.permissions.base import _cache, _get_workspace, _is_anonymous, user_workspace_groups, workspace_context
from plane.db.models import Product, ProductProject, Project, ProjectMember, WorkspaceMember, WorkspaceRole
from plane.utils.data_scope import ALL_SCOPE, EMPTY_SCOPE, ScopeResult, role_scope


def _workspace_member(user, workspace):
    return WorkspaceMember.objects.filter(member=user, workspace=workspace, is_active=True, deleted_at__isnull=True).first()


def _data_groups(user, workspace):
    """此人在工作区的数据权限（kind=data 的组，直绑 + 经团队；请求级缓存）。"""
    cache = _cache(user)
    cache_key = ("data_groups", workspace.id)
    if cache_key not in cache:
        member = _workspace_member(user, workspace)
        groups = user_workspace_groups(user, workspace, member) if member else []
        cache[cache_key] = [role for role in groups if role.kind == WorkspaceRole.KIND_DATA]
    return cache[cache_key]


def whitelisted_project_scope(user, workspace) -> ScopeResult:
    result = EMPTY_SCOPE
    for role in _data_groups(user, workspace):
        result = result.union(role_scope(role, "projects", workspace, user))
        if result.all:
            break
    return result


def whitelisted_product_scope(user, workspace) -> ScopeResult:
    result = EMPTY_SCOPE
    for role in _data_groups(user, workspace):
        result = result.union(role_scope(role, "products", workspace, user))
        if result.all:
            break
    return result


# ---------------------------------------------------------------------------
# 项目
# ---------------------------------------------------------------------------


def visible_project_scope(user, workspace_or_slug) -> ScopeResult:
    workspace = _get_workspace(workspace_or_slug)
    if workspace is None or _is_anonymous(user):
        return EMPTY_SCOPE
    cache = _cache(user)
    cache_key = ("visible_projects", workspace.id)
    if cache_key in cache:
        return cache[cache_key]
    context = workspace_context(user, workspace)
    if context.passthrough:
        result = ALL_SCOPE
    elif not context.is_member:
        result = EMPTY_SCOPE
    else:
        result = whitelisted_project_scope(user, workspace)
        if not result.all:
            member_ids = ProjectMember.objects.filter(
                member=user, workspace=workspace, is_active=True, deleted_at__isnull=True
            ).values_list("project_id", flat=True)
            led_ids = Project.objects.filter(workspace=workspace, project_lead=user).values_list("id", flat=True)
            result = ScopeResult(ids=result.ids | {str(v) for v in member_ids} | {str(v) for v in led_ids})
    cache[cache_key] = result
    return result


def visible_project_ids(user, workspace_or_slug) -> frozenset:
    """能看到的项目 id。直通的人展开成工作区全部项目。"""
    scope = visible_project_scope(user, workspace_or_slug)
    if scope.all:
        workspace = _get_workspace(workspace_or_slug)
        return frozenset(str(v) for v in Project.objects.filter(workspace=workspace).values_list("id", flat=True))
    return scope.ids


def visible_projects_q(user, workspace_or_slug, field="project", lookup=None) -> Q:
    """给跨项目查询用：``field`` 是到项目的 FK 字段名（``"project"`` → ``project_id__in``，``None`` → 查项目表本身）；
    多对多 / 反向关系传 ``lookup``（如 ``"projects__in"``、``"scheme__projects__in"``）。全部可见时返回空 Q（不收窄）。"""
    scope = visible_project_scope(user, workspace_or_slug)
    if scope.all:
        return Q()
    if lookup is None:
        lookup = "id__in" if field is None else f"{field}_id__in"
    return Q(**{lookup: list(scope.ids)})


def can_access_project(user, workspace_or_slug, project_id) -> bool:
    if not project_id:
        return False
    return visible_project_scope(user, workspace_or_slug).contains(project_id)


# ---------------------------------------------------------------------------
# 产品
# ---------------------------------------------------------------------------


def visible_product_scope(user, workspace_or_slug) -> ScopeResult:
    workspace = _get_workspace(workspace_or_slug)
    if workspace is None or _is_anonymous(user):
        return EMPTY_SCOPE
    cache = _cache(user)
    cache_key = ("visible_products", workspace.id)
    if cache_key in cache:
        return cache[cache_key]
    context = workspace_context(user, workspace)
    if context.passthrough:
        result = ALL_SCOPE
    elif not context.is_member:
        result = EMPTY_SCOPE
    else:
        result = whitelisted_product_scope(user, workspace)
        if not result.all:
            ids = set(result.ids)
            ids |= {
                str(v)
                for v in Product.objects.filter(workspace=workspace)
                .filter(Q(owner=user) | Q(reviewers=user))
                .values_list("id", flat=True)
            }
            project_scope = visible_project_scope(user, workspace)
            linked = ProductProject.objects.filter(workspace=workspace, project__deleted_at__isnull=True)
            if not project_scope.all:
                linked = linked.filter(project_id__in=list(project_scope.ids))
            ids |= {str(v) for v in linked.values_list("product_id", flat=True)}
            result = ScopeResult(ids=ids)
    cache[cache_key] = result
    return result


def visible_product_ids(user, workspace_or_slug) -> frozenset:
    scope = visible_product_scope(user, workspace_or_slug)
    if scope.all:
        workspace = _get_workspace(workspace_or_slug)
        return frozenset(str(v) for v in Product.objects.filter(workspace=workspace).values_list("id", flat=True))
    return scope.ids


def visible_products_q(user, workspace_or_slug, field=None) -> Q:
    scope = visible_product_scope(user, workspace_or_slug)
    if scope.all:
        return Q()
    lookup = "id__in" if field is None else f"{field}_id__in"
    return Q(**{lookup: list(scope.ids)})


def can_access_product(user, workspace_or_slug, product_id) -> bool:
    if not product_id:
        return False
    return visible_product_scope(user, workspace_or_slug).contains(product_id)
