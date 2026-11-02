"""需求 ↔ 测试用例关联：配对规则、两个方向的候选池与批量写校验。

这张关联表有两扇门 —— 需求侧（`views/requirement/test_case.py`）与用例侧
（`views/qa/case_requirement.py`），两边都是产品作用域。**配对规则只在本模块定义一次**，两端
共用；任何一端自己重写一份，迟早和另一端漂移出「A 能挂 B 但 B 挂不上 A」的鬼故事。

配对规则 —— 一对 (requirement, case) 可关联当且仅当：

  1. 同 workspace；
  2. requirement.product_id 非空（标准库条目与项目自建需求不参与，与
     requirement_project.resolve_linkable_requirements 的 NOT_PRODUCT_SCOPED 同口径）；
  3. requirement.status != closed（见 RequirementItemStatus 的 docstring：closed 不进
     任何关联选择器，但已有关联保留、仍可解除）；
  4. case.repository.product_id == requirement.product_id（2026-11 起用例归产品，
     需求只能挂本产品的用例）。

**刻意不设评审门槛。** 「需求进项目」这条链路（requirement_project.
linkable_requirements_queryset）如今同样不设评审门槛；需求进了项目之后再挂容器与
事实（迭代 / 发布 / 工作项）一律不再拦 in_review —— 理由见
views/requirement/container.py 的模块注释：测试是项目侧的节奏，不该被产品侧审批阻塞，
前端软提示即可。用例关联同理。
"""

from plane.db.models import (
    Requirement,
    RequirementItemStatus,
    RequirementProject,
    RequirementTestCase,
    TestCase,
)
from plane.utils.requirement_project import RequirementLinkError


def linked_project_ids(requirement_id):
    """需求已关联的项目 id（项目侧维护关联的权限判定用）。

    .order_by() 清掉 RequirementProject 的默认排序（("sort_order", "-created_at")）——
    它只当子查询用，带着排序列进 IN (...) 会变成多列子查询。
    """
    return (
        RequirementProject.objects.filter(requirement_id=requirement_id)
        .order_by()
        .values_list("project_id", flat=True)
    )


def linked_case_ids(requirement_id):
    return (
        RequirementTestCase.objects.filter(requirement_id=requirement_id)
        .order_by()
        .values_list("case_id", flat=True)
    )


def linked_requirement_ids_of_case(case_id):
    return (
        RequirementTestCase.objects.filter(case_id=case_id)
        .order_by()
        .values_list("requirement_id", flat=True)
    )


def linkable_test_cases_queryset(*, slug, requirement):
    """需求侧候选池：需求所属产品下、尚未关联进来的用例。

    repository__deleted_at__isnull=True 必须显式写：外键穿透不走 SoftDeletionManager，
    软删掉的用例库下面的用例照样会被捞出来（同 requirement_project 里那一串
    issue__deleted_at__isnull=True 的理由）。
    """
    return (
        TestCase.objects.filter(
            repository__workspace__slug=slug,
            repository__deleted_at__isnull=True,
            repository__product_id=requirement.product_id,
        )
        .exclude(id__in=linked_case_ids(requirement.id))
        .select_related("repository", "module", "assignee")
        .order_by("repository__name", "code", "id")
    )


def linkable_requirements_for_case_queryset(*, slug, case):
    """用例侧候选池：用例所属产品下、能挂且尚未挂上的需求。

    **刻意不叫 linkable_requirements_queryset** —— requirement_project 里已有同名函数，
    语义完全不同（那个是「哪些需求能进这个项目」）。
    """
    return (
        Requirement.objects.filter(
            workspace__slug=slug,
            product_id=case.repository.product_id,
            product_id__isnull=False,
        )
        .exclude(status=RequirementItemStatus.CLOSED)
        .exclude(id__in=linked_requirement_ids_of_case(case.id))
        .select_related("product")
        .order_by("product__identifier", "sort_order", "created_at", "id")
    )


def resolve_linkable_test_cases(*, slug, requirement, case_ids):
    """需求侧：把一批用例 id 解析成可关联的用例行；任一条不合格就整批拒绝。

    全有或全无 —— 与 resolve_linkable_requirements 同样的取舍：部分成功会让前端拿不准
    哪些生效了，而这里的失败原因（用例不在作用域内）用户能自己修。
    """
    requested = list(dict.fromkeys(str(item) for item in case_ids))
    if not requested:
        raise RequirementLinkError(
            "Test cases are required.", code="REQUIREMENT_TEST_CASE_LINK_EMPTY"
        )

    rows = list(
        TestCase.objects.filter(
            id__in=requested,
            repository__workspace__slug=slug,
            repository__deleted_at__isnull=True,
        ).select_related("repository")
    )
    found = {str(row.id): row for row in rows}

    conflicts = []
    for case_id in requested:
        row = found.get(case_id)
        if row is None:
            conflicts.append({"id": case_id, "reason": "NOT_FOUND"})
        elif row.repository.product_id != requirement.product_id:
            conflicts.append({"id": case_id, "reason": "PRODUCT_OUT_OF_SCOPE"})

    if conflicts:
        raise RequirementLinkError(
            "Some test cases cannot be linked to this requirement.",
            code="REQUIREMENT_TEST_CASE_LINK_REJECTED",
            detail={"conflicts": conflicts},
        )

    return [found[case_id] for case_id in requested]


def resolve_linkable_requirements_for_case(*, slug, case, requirement_ids):
    """用例侧：把一批需求 id 解析成可关联的需求行；任一条不合格就整批拒绝。

    比需求侧多两条 reason —— 从用例侧进来的 id 是用户在需求选择器里挑的，标准库条目
    和已关闭的需求都可能被旧的前端缓存带进来。
    """
    requested = list(dict.fromkeys(str(item) for item in requirement_ids))
    if not requested:
        raise RequirementLinkError(
            "Requirements are required.", code="REQUIREMENT_TEST_CASE_LINK_EMPTY"
        )

    rows = list(
        # workspace_id 必须一起取：link_test_cases 要用它填关联行（BaseModel 没有
        # ProjectBaseModel 那段 workspace 反填），漏了会退化成每条需求一次延迟加载。
        Requirement.objects.filter(id__in=requested, workspace__slug=slug).only(
            "id", "product_id", "status", "workspace_id"
        )
    )
    found = {str(row.id): row for row in rows}
    case_product_id = case.repository.product_id if case.repository_id else None

    conflicts = []
    for requirement_id in requested:
        row = found.get(requirement_id)
        if row is None:
            conflicts.append({"id": requirement_id, "reason": "NOT_FOUND"})
        elif not row.product_id:
            conflicts.append({"id": requirement_id, "reason": "NOT_PRODUCT_SCOPED"})
        elif row.status == RequirementItemStatus.CLOSED:
            conflicts.append({"id": requirement_id, "reason": "CLOSED"})
        elif row.product_id != case_product_id:
            conflicts.append({"id": requirement_id, "reason": "PRODUCT_OUT_OF_SCOPE"})

    if conflicts:
        raise RequirementLinkError(
            "Some requirements cannot be linked to this test case.",
            code="REQUIREMENT_TEST_CASE_LINK_REJECTED",
            detail={"conflicts": conflicts},
        )

    return [found[requirement_id] for requirement_id in requested]


def link_test_cases(*, requirement, cases, actor_id=None):
    """写入关联行。已存在的行由条件唯一索引 + ignore_conflicts 幂等吸收。

    bulk_create 绕开 BaseModel.save()，workspace_id 与 created_by_id 都必须显式给 ——
    这张表继承 BaseModel（没有 ProjectBaseModel 那段 workspace 反填），更没有兜底。
    """
    RequirementTestCase.objects.bulk_create(
        [
            RequirementTestCase(
                requirement_id=requirement.id,
                case_id=case.id,
                workspace_id=requirement.workspace_id,
                created_by_id=actor_id,
                updated_by_id=actor_id,
            )
            for case in cases
        ],
        batch_size=100,
        ignore_conflicts=True,
    )


def has_project_side_link_permission(user, *, slug, requirement, manage=False):
    """调用者能否从**项目侧**维护这条需求的用例关联。

    需求侧端点的第二道门。第一道是产品权限（can_view_product /
    can_edit_product_requirements），但项目成员不一定是产品成员，而
    can_view_product 只对 public 产品（network=2）放行非产品成员 —— 只认第一道门的话，
    项目侧连读都读不到。

    **这不是在放开新权限**：用例侧的端点（views/qa/case_requirement.py）已经允许带
    qa.case.edit 的项目成员写这张表。需求侧只认产品权限反而是两扇门不对称，
    项目成员能从用例那头挂、从需求这头挂不了。

    逐个项目短路判定：一条需求通常只进 1-2 个项目，_get_user_project_permission_keys
    每个项目一次查询，命中即返回。
    """
    from plane.app.permissions import PermissionKey
    from plane.app.permissions.base import _get_user_project_permission_keys

    required = (
        PermissionKey.PROJECT_REQUIREMENT_LINK_MANAGE.value
        if manage
        else PermissionKey.PROJECT_REQUIREMENT_LINK_VIEW.value
    )
    for project_id in linked_project_ids(requirement.id):
        try:
            keys = _get_user_project_permission_keys(user, slug, str(project_id))
        except Exception:
            # 项目行不存在 / 已删：这条关联不该拦住其他项目的判定
            continue
        if required in keys:
            return True
    return False
