"""测试管理各模块树的批量新建端点（用例库模块 / 用例模块 / 计划模块 / 评审模块 / 报告模块）。

请求体统一 ``{"parent": <id|null>, "items": [{"name", "children"}], ...作用域字段}``；
鉴权与作用域口径照各自的单个新建接口，建树规则见 utils.module_bulk。
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.views.base import BaseAPIView
from plane.app.views.qa.case_scope import (
    CASE_EDIT,
    TEMPLATE_MANAGE,
    as_id_list,
    case_scope_error,
    product_scope_error,
    project_scope_error,
)
from plane.app.views.qa.product_scope import allow_product_scope
from plane.app.views.qa.repository_module import MODULE_WRITE
from plane.app.views.qa.review import REVIEW_EDIT
from plane.db.models import (
    CaseModule,
    CaseRepositoryModule,
    CaseReviewModule,
    PlanModule,
    Product,
    Project,
    ReportModule,
    TestCaseRepository,
)
from plane.utils.module_bulk import bulk_create_response
from plane.utils.product_category import CaseModuleRootLocked, case_root_lock_violation

PARENT_NOT_FOUND = "上级模块不存在。"


def _parent_or_error(model, parent_id, scope):
    """(parent, error_response)：parent_id 为空 → (None, None)；不在本树里 → 400。"""
    if not parent_id:
        return None, None
    parent = model.objects.filter(id=parent_id, **scope).first()
    if parent is None:
        return None, Response({"error": PARENT_NOT_FOUND}, status=status.HTTP_400_BAD_REQUEST)
    return parent, None


class CaseRepositoryModuleBulkAPIView(BaseAPIView):
    model = CaseRepositoryModule

    @allow_product_scope(*MODULE_WRITE)
    def post(self, request, slug, product_id):
        product = Product.objects.get(id=product_id, workspace__slug=slug)
        scope = {"product_id": product.id}
        parent, error = _parent_or_error(CaseRepositoryModule, request.data.get("parent"), scope)
        if error is not None:
            return error
        return bulk_create_response(
            model=CaseRepositoryModule,
            scope=scope,
            parent=parent,
            raw_items=request.data.get("items"),
            extra={"workspace_id": product.workspace_id},
        )


class CaseModuleBulkAPIView(BaseAPIView):
    model = CaseModule

    def post(self, request, slug):
        repository_id = request.data.get("repository")
        parent_id = request.data.get("parent") or None
        error = case_scope_error(
            request,
            slug,
            keys=CASE_EDIT,
            template_keys=TEMPLATE_MANAGE,
            repository_ids=as_id_list(repository_id),
            module_ids=as_id_list(parent_id),
        )
        if error is not None:
            return error
        repository = TestCaseRepository.objects.filter(id=repository_id, workspace__slug=slug).first()
        if repository is None:
            return Response({"error": "用例库不存在。"}, status=status.HTTP_404_NOT_FOUND)
        locked = case_root_lock_violation(repository, data={"parent": parent_id})
        if locked:
            raise CaseModuleRootLocked(locked)
        scope = {"repository_id": repository.id}
        parent, error = _parent_or_error(CaseModule, parent_id, scope)
        if error is not None:
            return error
        return bulk_create_response(
            model=CaseModule, scope=scope, parent=parent, raw_items=request.data.get("items")
        )


class PlanModuleBulkAPIView(BaseAPIView):
    model = PlanModule

    def post(self, request, slug):
        project_id = request.data.get("project")
        error = project_scope_error(
            request,
            slug,
            as_id_list(project_id),
            keys=(PermissionKey.PROJECT_TEST_PLAN_CREATE, PermissionKey.PROJECT_TEST_PLAN_EDIT),
        )
        if error is not None:
            return error
        project = Project.objects.filter(id=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "项目不存在。"}, status=status.HTTP_404_NOT_FOUND)
        scope = {"project_id": project.id}
        parent, error = _parent_or_error(PlanModule, request.data.get("parent"), scope)
        if error is not None:
            return error
        return bulk_create_response(
            model=PlanModule, scope=scope, parent=parent, raw_items=request.data.get("items")
        )


class ReviewModuleBulkAPIView(BaseAPIView):
    model = CaseReviewModule

    def post(self, request, slug):
        product = Product.objects.filter(id=request.data.get("product"), workspace__slug=slug).first()
        if product is None:
            return Response({"error": "product is required"}, status=status.HTTP_400_BAD_REQUEST)
        error = product_scope_error(request, slug, [product.id], keys=REVIEW_EDIT)
        if error is not None:
            return error
        scope = {"product_id": product.id}
        parent, error = _parent_or_error(CaseReviewModule, request.data.get("parent"), scope)
        if error is not None:
            return error
        return bulk_create_response(
            model=CaseReviewModule, scope=scope, parent=parent, raw_items=request.data.get("items")
        )


class ReportModuleBulkAPIView(BaseAPIView):
    model = ReportModule

    @allow_fine_permission(PermissionKey.PROJECT_TEST_REPORT_CREATE)
    def post(self, request, slug, project_id):
        if not Project.objects.filter(id=project_id, workspace__slug=slug).exists():
            return Response({"error": "项目不存在。"}, status=status.HTTP_404_NOT_FOUND)
        scope = {"project_id": project_id}
        parent, error = _parent_or_error(ReportModule, request.data.get("parent"), scope)
        if error is not None:
            return error
        return bulk_create_response(
            model=ReportModule, scope=scope, parent=parent, raw_items=request.data.get("items")
        )
