"""测试用例 ↔ 需求的关联端点（用例侧）。

这是同一张关联表 RequirementTestCase 的第二扇门。第一扇在
views/requirement/test_case.py（产品作用域 + can_edit_product_requirements），给需求
owner 用；这一扇是项目作用域 + QA_CASE_* 权限，给测试人员用 —— 他们通常是项目成员而
不是产品成员，走产品侧那扇门会被 403 挡住。

**为什么挂项目级路由，而不是像 add-issue-case 那样挂 workspace 级的 CaseAPI viewset**：
CaseAPI 下 add-issue-case / delete-issue-case 等 action 目前只有 IsAuthenticated、
没有权限装饰器。这张表的另一扇门要 can_edit_product_requirements，用例侧若裸奔就等于
开了一个绕过口 —— 那会是本次新引入的洞，不是既有的。项目级路由能直接吃现成的
QA_CASE_VIEW / QA_CASE_EDIT。

**已知限制**：repository.project 为空的共享用例库，只能从需求侧关联。
allow_fine_permission 的 project 级分支在 project_id 为空时权限集必为空 → 必然 403
（permissions/base.py），要开就得新造一套 workspace 级的 QA 权限键。

配对规则一律走 utils/requirement_test_case.py，本文件不自己判断任何作用域。
"""

from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import RequirementTestCase, TestCase
from plane.utils.requirement import requirement_display_id
from plane.utils.requirement_project import RequirementLinkError
from plane.utils.requirement_test_case import (
    link_test_cases,
    linkable_requirements_for_case_queryset,
    resolve_linkable_requirements_for_case,
)

DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 100


class CaseScopedMixin:
    def _get_case(self, slug, project_id, case_id):
        """作用域校验照 TestReportAPIView._project_queryset 的写法 —— QA 模块里最规范
        的一份。用例的 project 来自 repository，所以要穿透一层。"""
        return (
            TestCase.objects.filter(
                id=case_id,
                repository__project_id=project_id,
                repository__workspace__slug=slug,
                repository__deleted_at__isnull=True,
            )
            .select_related("repository")
            .first()
        )


class CaseRequirementAPIView(CaseScopedMixin, BaseAPIView):
    """某条用例关联的需求（项目作用域）。"""

    model = RequirementTestCase

    @allow_fine_permission(PermissionKey.QA_CASE_VIEW)
    def get(self, request, slug, project_id, case_id):
        """已关联的需求行。轻量反查，不走需求序列化器（那是给产品需求网格的）。"""
        case = self._get_case(slug, project_id, case_id)
        if case is None:
            return Response(
                {"error": "Test case not found."}, status=status.HTTP_404_NOT_FOUND
            )

        links = (
            RequirementTestCase.objects.filter(case_id=case.id)
            .select_related("requirement", "requirement__product")
            .order_by("-created_at")
        )
        return Response(
            [
                {
                    "requirement_id": str(link.requirement_id),
                    "requirement_display_id": requirement_display_id(link.requirement),
                    "requirement_name": link.requirement.title,
                    "requirement_status": link.requirement.status,
                    "product_id": (
                        str(link.requirement.product_id)
                        if link.requirement.product_id
                        else None
                    ),
                }
                for link in links
            ],
            status=status.HTTP_200_OK,
        )

    @allow_fine_permission(PermissionKey.QA_CASE_EDIT)
    def post(self, request, slug, project_id, case_id):
        """关联需求，唯一载荷 {"requirements": [id, ...]}。全有或全无。"""
        case = self._get_case(slug, project_id, case_id)
        if case is None:
            return Response(
                {"error": "Test case not found."}, status=status.HTTP_404_NOT_FOUND
            )

        try:
            requirements = resolve_linkable_requirements_for_case(
                slug=slug,
                case=case,
                requirement_ids=request.data.get("requirements", []),
            )
        except RequirementLinkError as exc:
            payload = {"error": exc.message}
            if exc.code:
                payload["code"] = exc.code
            payload.update(exc.detail)
            return Response(payload, status=status.HTTP_409_CONFLICT)

        # link_test_cases 的入参是 (一条需求, 多条用例)，这里方向相反 —— 逐条需求
        # 各写一行，批量的收益在这个方向上不存在（一条用例通常只挂个位数需求）。
        for requirement in requirements:
            link_test_cases(
                requirement=requirement, cases=[case], actor_id=request.user.id
            )
        return Response({"message": "success"}, status=status.HTTP_201_CREATED)

    @allow_fine_permission(PermissionKey.QA_CASE_EDIT)
    def delete(self, request, slug, project_id, case_id):
        """解除单条关联，载荷 {"requirement_id": id}。"""
        case = self._get_case(slug, project_id, case_id)
        if case is None:
            return Response(
                {"error": "Test case not found."}, status=status.HTTP_404_NOT_FOUND
            )

        requirement_id = request.data.get("requirement_id") or request.query_params.get(
            "requirement_id"
        )
        if not requirement_id:
            return Response(
                {"error": "requirement_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        link = RequirementTestCase.objects.filter(
            case_id=case.id, requirement_id=requirement_id
        ).first()
        if link is None:
            return Response(
                {"error": "Link not found."}, status=status.HTTP_404_NOT_FOUND
            )
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CaseLinkableRequirementAPIView(CaseScopedMixin, BaseAPIView):
    """用例侧的需求候选池（项目作用域）。

    与需求侧的 linkable-test-cases 一样只给有写权限的人 —— 它会露出尚未挂上的需求内容。
    池子的判定在 utils/requirement_test_case.linkable_requirements_for_case_queryset，
    与写校验共用同一条配对规则。
    """

    model = RequirementTestCase

    @allow_fine_permission(PermissionKey.QA_CASE_EDIT)
    def get(self, request, slug, project_id, case_id):
        case = self._get_case(slug, project_id, case_id)
        if case is None:
            return Response(
                {"error": "Test case not found."}, status=status.HTTP_404_NOT_FOUND
            )

        queryset = linkable_requirements_for_case_queryset(slug=slug, case=case)

        search = (request.query_params.get("search") or "").strip()
        if search:
            # 单个 .filter(Q|Q)：候选池里已经带了 exclude 子查询，用 | 合并两个
            # queryset 会重复 join 出重复行
            queryset = queryset.filter(Q(title__icontains=search))

        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda rows: [
                {
                    "id": str(row.id),
                    "display_id": requirement_display_id(row),
                    "name": row.title,
                    "status": row.status,
                    "product_id": str(row.product_id) if row.product_id else None,
                    "product_name": row.product.name if row.product_id else None,
                    "product_identifier": (
                        row.product.identifier if row.product_id else None
                    ),
                }
                for row in rows
            ],
            default_per_page=DEFAULT_PER_PAGE,
            max_per_page=MAX_PER_PAGE,
        )
