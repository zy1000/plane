# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""需求 ↔ 测试用例的关联端点（产品侧）。

**产品作用域而不是项目作用域** —— 这是与需求的另外四张关联表最大的不同。迭代 / 发布 /
工作项都是项目级事实，所以那些端点挂在 projects/<project_id>/ 下；测试用例不是：用例的
作用域间接来自 TestCaseRepository.project，而那一列可空（跨项目共享用例库）。关联本身是
需求级的，一条需求的关联用例可以横跨它进过的所有项目，按单个项目切开就表达不出来。

权限是**两道门任一放行**（见 _resolve）：产品侧的 can_view_product /
can_edit_product_requirements，或该需求已关联项目上的 PROJECT_REQUIREMENT_LINK_VIEW /
MANAGE。后者不可省 —— 项目成员不一定是产品成员，而 can_view_product 只对 public 产品
放行非产品成员，只认产品权限的话项目侧的需求抽屉连列表都拉不到。

用例侧还有第三个入口（views/qa/case_requirement.py，项目作用域 + QA_CASE_* 权限），
写的是同一张表 —— 这正是 RequirementProject 的既有先例：多个入口、不同钥匙、
一套配对规则。

配对规则一律走 utils/requirement_test_case.py，本文件不自己判断任何作用域。
"""

from django.db.models import F, OuterRef, Q, Subquery
from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseViewSet
from plane.db.models import Requirement, RequirementTestCase, TestCase
from plane.utils.product import can_edit_product_requirements, can_view_product
from plane.utils.requirement_project import RequirementLinkError
from plane.utils.requirement_test_case import (
    has_project_side_link_permission,
    link_test_cases,
    linkable_test_cases_queryset,
    linked_project_ids,
    resolve_linkable_test_cases,
)

DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 100

# 够渲染一行用例，不多取。**刻意不取 TestCase.review** —— 那个 property 每行发两次
# 查询（qa.py 的 review），列表里就是 N+1。
CASE_ROW_FIELDS = (
    "id",
    "code",
    "name",
    "type",
    "test_type",
    "priority",
    "repository_id",
    "module_id",
    "assignee_id",
    "created_at",
    "updated_at",
)

CASE_ROW_ANNOTATIONS = {
    "repository_name": F("repository__name"),
    "module_name": F("module__name"),
    # project 为空表示共享用例库；前端据此打标，也据此解释「为什么别的项目也看得到」
    "repository_project_id": F("repository__project_id"),
}


def _case_rows(queryset):
    return queryset.values(*CASE_ROW_FIELDS, **CASE_ROW_ANNOTATIONS)


def _link_error_response(exc: RequirementLinkError):
    """与 views/requirement/project.py 的同名函数逐字一致的 409 形状。"""
    payload = {"error": exc.message}
    if exc.code:
        payload["code"] = exc.code
    payload.update(exc.detail)
    return Response(payload, status=status.HTTP_409_CONFLICT)


class RequirementTestCaseViewSet(BaseViewSet):
    """需求 ↔ 测试用例。纯关联，不参与任何统计。"""

    model = RequirementTestCase

    # --- 共用 -----------------------------------------------------------

    def _resolve(self, request, slug, product_id, requirement_id, *, for_write):
        """解析需求，顺带做权限闸门。返回 (requirement, error_response)。

        **两道门，任一放行即可**：
          1. 产品侧 —— can_view_product / can_edit_product_requirements，需求 owner 走这条；
          2. 项目侧 —— 该需求已关联项目上的 PROJECT_REQUIREMENT_LINK_VIEW / MANAGE。

        第二道门是必须的：项目成员不一定是产品成员，而 can_view_product 只对 public
        产品放行非产品成员 —— 只认第一道门，项目侧的需求抽屉连列表都拉不到。这也让两扇
        门对称：用例侧端点早就允许带 qa.case.edit 的项目成员写这张表。

        刻意**不**先解析 product 再按它 404：产品不可见时也要给项目侧一个机会，所以
        先按 (id, product_id, slug) 取需求行，产品对象从 select_related 上拿。
        读不到一律 404 而不是 403 —— 不泄漏产品/需求的存在性。
        """
        requirement = (
            Requirement.objects.filter(
                id=requirement_id, product_id=product_id, workspace__slug=slug
            )
            .select_related("product")
            .first()
        )
        if requirement is None or requirement.product is None:
            return None, Response(
                {"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND
            )

        product = requirement.product
        can_read = can_view_product(request.user, product) or (
            has_project_side_link_permission(
                request.user, slug=slug, requirement=requirement
            )
        )
        if not can_read:
            return None, Response(
                {"error": "Requirement not found."}, status=status.HTTP_404_NOT_FOUND
            )

        if for_write:
            can_write = can_edit_product_requirements(
                request.user, product
            ) or has_project_side_link_permission(
                request.user, slug=slug, requirement=requirement, manage=True
            )
            if not can_write:
                return None, Response(
                    {
                        "error": "You do not have permission to maintain test case links for this requirement."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
        return requirement, None

    # --- 读 -------------------------------------------------------------

    def list(self, request, slug, product_id, requirement_id):
        """已关联的用例行。无分页，与 RequirementIssueViewSet.list 同一取舍 ——
        一条需求的用例是人手挂的，量级和子需求相当，一次给完让前端少一轮请求。"""
        requirement, error = self._resolve(
            request, slug, product_id, requirement_id, for_write=False
        )
        if error is not None:
            return error

        # 关联时间用 Subquery 注解、按 id__in 收窄，**不要**写成
        # .filter(case_requirements__requirement_id=...).order_by("-case_requirements__created_at")
        # —— order_by 穿反向关系会再开一个不带 requirement 过滤的 join，同时挂在两条
        # 需求上的用例会出两行。RequirementTestCase.objects 自带软删过滤（SoftDeletionManager），
        # 直接查它不需要显式 deleted_at 条件；穿反向关系才需要。
        link_rows = RequirementTestCase.objects.filter(
            requirement_id=requirement.id, case_id=OuterRef("pk")
        )
        cases = _case_rows(
            TestCase.objects.filter(
                id__in=RequirementTestCase.objects.filter(requirement_id=requirement.id)
                .order_by()
                .values_list("case_id", flat=True)
            )
            .annotate(linked_at=Subquery(link_rows.values("created_at")[:1]))
            .order_by("-linked_at")
        )
        return Response(list(cases), status=status.HTTP_200_OK)

    def linkable(self, request, slug, product_id, requirement_id):
        """候选池：能挂到这条需求上、且尚未挂上的用例。

        与 ProjectRequirementViewSet.linkable 同样只给有写权限的人 —— 它会露出需求
        关联项目下的全部用例，那是项目侧的内容。
        """
        requirement, error = self._resolve(
            request, slug, product_id, requirement_id, for_write=True
        )
        if error is not None:
            return error

        # 项目侧抽屉传 project_id 把池子收窄到本项目 + 共享库，免得项目 A 的成员在
        # 选择器里浏览到项目 B 的用例名。只接受确实在这条需求关联项目里的 id ——
        # 否则这个参数就成了探测任意项目用例库的口子。
        restrict_project_id = request.query_params.get("project_id") or None
        if restrict_project_id and restrict_project_id not in {
            str(pid) for pid in linked_project_ids(requirement.id)
        }:
            return Response(
                {"error": "Project is not linked to this requirement."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = linkable_test_cases_queryset(
            slug=slug, requirement=requirement, restrict_project_id=restrict_project_id
        )

        search = (request.query_params.get("search") or "").strip()
        if search:
            # 单个 .filter(Q|Q)，不要写成 qs.filter(...) | qs.filter(...) —— 候选池里
            # 已经带了 Q 组合与 exclude 子查询，用 | 合并两个 queryset 会重复 join 出重复行
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(code__icontains=search)
            )
        repository_id = request.query_params.get("repository_id")
        if repository_id:
            queryset = queryset.filter(repository_id=repository_id)

        return self.paginate(
            request=request,
            queryset=_case_rows(queryset),
            on_results=list,
            default_per_page=DEFAULT_PER_PAGE,
            max_per_page=MAX_PER_PAGE,
        )

    # --- 写 -------------------------------------------------------------

    def create(self, request, slug, product_id, requirement_id):
        """关联已有用例，唯一载荷 {"test_cases": [id, ...]}。

        全有或全无 —— 与 resolve_linkable_requirements 同取舍：部分成功会让前端不知道
        该刷谁。已存在的关联由条件唯一索引 + ignore_conflicts 幂等吸收。
        """
        requirement, error = self._resolve(
            request, slug, product_id, requirement_id, for_write=True
        )
        if error is not None:
            return error

        try:
            cases = resolve_linkable_test_cases(
                slug=slug,
                requirement=requirement,
                case_ids=request.data.get("test_cases", []),
            )
        except RequirementLinkError as exc:
            return _link_error_response(exc)

        link_test_cases(
            requirement=requirement, cases=cases, actor_id=request.user.id
        )
        return Response({"message": "success"}, status=status.HTTP_201_CREATED)

    def destroy(self, request, slug, product_id, requirement_id, case_id):
        """解除单条关联。已关闭（closed）的需求同样可以解除 —— closed 保护的是内容，
        不是关联（见 RequirementItemStatus 的 docstring）。"""
        requirement, error = self._resolve(
            request, slug, product_id, requirement_id, for_write=True
        )
        if error is not None:
            return error

        link = RequirementTestCase.objects.filter(
            requirement_id=requirement.id, case_id=case_id
        ).first()
        if link is None:
            return Response(
                {"error": "Link not found."}, status=status.HTTP_404_NOT_FOUND
            )
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
