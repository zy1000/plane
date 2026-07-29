"""需求变更审批与版本管理的 API 入口。

四组端点：工作副本（编辑 / 撤回草稿）、变更单（列表 / 详情 / 提交 / 审批 / 撤回）、
变更项（明细数据组的分页）、版本（列表 / 详情 / 快照明细分页 / 版本比较 / 回滚）。

千行明细的取舍集中在两处：变更单详情只内联基本信息与字段定义两组变更项，明细组
走 items 端点分页；版本快照的 details 数组在服务端切片，不整份返回。
"""

import math

from django.db import transaction
from django.db.models import Count, Prefetch, Q
from rest_framework import status
from rest_framework.exceptions import ParseError
from rest_framework.response import Response

from plane.app.serializers import (
    RequirementChangeActionSerializer,
    RequirementChangeItemSerializer,
    RequirementChangeRequestDetailSerializer,
    RequirementChangeRequestSerializer,
    RequirementChangeSubmitSerializer,
    RequirementSerializer,
    RequirementVersionComparisonItemSerializer,
    RequirementVersionComparisonSerializer,
    RequirementVersionDetailSerializer,
    RequirementVersionSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.app.views.requirement.mixins import (
    can_write_requirement,
    get_scoped_requirement,
)
from plane.db.models import (
    RequirementChangeApproval,
    RequirementChangeItem,
    RequirementChangeRequest,
    RequirementChangeTargetKind,
    RequirementChangeType,
    RequirementStatus,
    RequirementVersion,
)
from plane.utils.paginator import Cursor
from plane.utils.requirement_change import (
    RequirementChangeError,
    act_on_change_request,
    build_version_comparison,
    cancel_change_request,
    rollback_to_version,
    submit_change_request,
)
from plane.utils.requirement_draft import discard_draft, start_editing


DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 100


def change_error_response(exc):
    return Response(
        {"error": str(exc), "code": exc.code},
        status=status.HTTP_409_CONFLICT,
    )


def paginate_sequence(view, request, items, *, default_per_page=DEFAULT_PER_PAGE):
    """对内存里的列表做游标切片，响应形状与 BasePaginator.paginate 一致。

    版本快照的 details 是一份 JSON 数组，没有 queryset 可以喂给分页器，但前端用的
    是同一套分页组件，所以这里手工对齐同一份响应契约。
    """
    per_page = view.get_per_page(request, default_per_page, MAX_PER_PAGE)
    try:
        cursor = Cursor.from_string(
            request.GET.get(view.cursor_name, f"{per_page}:0:0")
        )
    except ValueError:
        raise ParseError(detail="Invalid cursor parameter.")
    page = max(cursor.offset, 0)
    offset = page * per_page
    window = items[offset : offset + per_page]
    total = len(items)
    has_next = offset + per_page < total
    return Response(
        {
            "grouped_by": None,
            "sub_grouped_by": None,
            "total_count": total,
            "next_cursor": str(Cursor(per_page, page + 1, False, has_next)),
            "prev_cursor": str(Cursor(per_page, page - 1, True, page > 0)),
            "next_page_results": has_next,
            "prev_page_results": page > 0,
            "count": len(window),
            "total_pages": math.ceil(total / per_page) if per_page else 0,
            "total_results": total,
            "extra_stats": None,
            "results": window,
        },
        status=status.HTTP_200_OK,
    )


class RequirementScopedMixin:
    """变更相关端点共用的需求解析与写权限校验。"""

    def resolve_requirement(self, *, for_update=False):
        return get_scoped_requirement(
            self.request.user,
            slug=self.kwargs.get("slug"),
            requirement_id=self.kwargs.get("requirement_id"),
            for_update=for_update,
        )

    @staticmethod
    def not_found():
        return Response(
            {"error": "Requirement not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    @staticmethod
    def forbidden():
        return Response(
            {"error": "You do not have permission to maintain this requirement."},
            status=status.HTTP_403_FORBIDDEN,
        )

    def requirement_for_write(self, *, for_update=False):
        """返回 (requirement, error_response)。"""
        requirement = self.resolve_requirement(for_update=for_update)
        if requirement is None:
            return None, self.not_found()
        if requirement.is_template:
            return None, Response(
                {
                    "error": "Workspace templates do not go through the approval flow.",
                    "code": "REQUIREMENT_TEMPLATE_NOT_APPROVABLE",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not can_write_requirement(self.request.user, requirement):
            return None, self.forbidden()
        return requirement, None

    def requirement_payload(self, requirement):
        requirement.refresh_from_db()
        return RequirementSerializer(
            requirement,
            context={"request": self.request, "workspace": requirement.workspace},
        ).data


class RequirementWorkingCopyAPIView(RequirementScopedMixin, BaseAPIView):
    """POST = 「编辑」，DELETE = 「撤回草稿」。"""

    def post(self, request, slug, requirement_id):
        with transaction.atomic():
            requirement, error = self.requirement_for_write(for_update=True)
            if error is not None:
                return error
            if requirement.status == RequirementStatus.IN_REVIEW:
                return Response(
                    {
                        "error": "The requirement is under review and cannot be edited.",
                        "code": "REQUIREMENT_IN_REVIEW",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            start_editing(requirement=requirement, actor=request.user)
        return Response(
            {"requirement": self.requirement_payload(requirement)},
            status=status.HTTP_200_OK,
        )

    def delete(self, request, slug, requirement_id):
        with transaction.atomic():
            requirement, error = self.requirement_for_write(for_update=True)
            if error is not None:
                return error
            if requirement.status != RequirementStatus.DRAFT:
                return Response(
                    {
                        "error": "Only a draft requirement can be discarded.",
                        "code": "REQUIREMENT_NOT_DRAFT",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            outcome = discard_draft(requirement=requirement, actor=request.user)

        if outcome == "deleted":
            return Response({"outcome": outcome}, status=status.HTTP_200_OK)
        return Response(
            {"outcome": outcome, "requirement": self.requirement_payload(requirement)},
            status=status.HTTP_200_OK,
        )


class RequirementChangeRequestViewSet(RequirementScopedMixin, BaseViewSet):
    model = RequirementChangeRequest
    serializer_class = RequirementChangeRequestSerializer

    def get_queryset(self):
        approvals = RequirementChangeApproval.objects.select_related(
            "approver"
        ).order_by("created_at", "id")
        return (
            RequirementChangeRequest.objects.filter(
                requirement_id=self.kwargs.get("requirement_id"),
                requirement__workspace__slug=self.workspace_slug,
            )
            .select_related("created_by", "requirement")
            .prefetch_related(Prefetch("approvals", queryset=approvals))
            .order_by("-created_at", "-sequence_id")
        )

    def list(self, request, slug, requirement_id):
        requirement = self.resolve_requirement()
        if requirement is None:
            return self.not_found()
        queryset = self.get_queryset()
        change_status = request.query_params.get("status")
        if change_status:
            queryset = queryset.filter(status=change_status)
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda results: RequirementChangeRequestSerializer(
                results,
                many=True,
                context={"request": request},
            ).data,
            default_per_page=DEFAULT_PER_PAGE,
            max_per_page=MAX_PER_PAGE,
        )

    def retrieve(self, request, slug, requirement_id, pk):
        requirement = self.resolve_requirement()
        if requirement is None:
            return self.not_found()
        items = RequirementChangeItem.objects.order_by(
            "proposed_sort_order", "created_at", "id"
        ).exclude(target_kind=RequirementChangeTargetKind.DETAIL_DATA)
        change_request = (
            self.get_queryset()
            .filter(pk=pk)
            .prefetch_related(Prefetch("items", queryset=items))
            .annotate(
                detail_item_count=Count(
                    "items",
                    filter=Q(
                        items__target_kind=RequirementChangeTargetKind.DETAIL_DATA
                    ),
                    distinct=True,
                )
            )
            .first()
        )
        if change_request is None:
            return Response(
                {"error": "Change request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            RequirementChangeRequestDetailSerializer(
                change_request,
                context={
                    "request": request,
                    "detail_item_count": change_request.detail_item_count,
                },
            ).data,
            status=status.HTTP_200_OK,
        )

    def submit(self, request, slug, requirement_id):
        serializer = RequirementChangeSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                requirement, error = self.requirement_for_write(for_update=True)
                if error is not None:
                    return error
                change_request = submit_change_request(
                    requirement=requirement,
                    reason=serializer.validated_data["reason"],
                    actor=request.user,
                )
        except RequirementChangeError as exc:
            return change_error_response(exc)
        return Response(
            RequirementChangeRequestSerializer(
                self.get_queryset().get(pk=change_request.pk),
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )

    def act(self, request, slug, requirement_id, pk):
        serializer = RequirementChangeActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                requirement = self.resolve_requirement(for_update=True)
                if requirement is None:
                    return self.not_found()
                change_request = (
                    RequirementChangeRequest.objects.select_for_update()
                    .filter(pk=pk, requirement=requirement)
                    .first()
                )
                if change_request is None:
                    return Response(
                        {"error": "Change request not found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                act_on_change_request(
                    change_request=change_request,
                    approver=request.user,
                    action=serializer.validated_data["action"],
                    comment=serializer.validated_data["comment"],
                )
        except RequirementChangeError as exc:
            return change_error_response(exc)
        return Response(
            RequirementChangeRequestSerializer(
                self.get_queryset().get(pk=pk),
                context={"request": request},
            ).data,
            status=status.HTTP_200_OK,
        )

    def cancel(self, request, slug, requirement_id, pk):
        try:
            with transaction.atomic():
                requirement, error = self.requirement_for_write(for_update=True)
                if error is not None:
                    return error
                change_request = (
                    RequirementChangeRequest.objects.select_for_update()
                    .filter(pk=pk, requirement=requirement)
                    .first()
                )
                if change_request is None:
                    return Response(
                        {"error": "Change request not found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                if change_request.created_by_id != request.user.id:
                    return Response(
                        {
                            "error": "Only the submitter can withdraw this change request.",
                            "code": "REQUIREMENT_NOT_SUBMITTER",
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
                cancel_change_request(
                    change_request=change_request,
                    actor=request.user,
                )
        except RequirementChangeError as exc:
            return change_error_response(exc)
        return Response(
            RequirementChangeRequestSerializer(
                self.get_queryset().get(pk=pk),
                context={"request": request},
            ).data,
            status=status.HTTP_200_OK,
        )


class RequirementChangeItemViewSet(RequirementScopedMixin, BaseViewSet):
    """明细数据组变更项的分页列表。

    变更单详情不内联这一组 —— 改了几百行就是几百条变更项，每条还带两份完整行数据。
    """

    model = RequirementChangeItem
    serializer_class = RequirementChangeItemSerializer

    def get_queryset(self):
        return (
            RequirementChangeItem.objects.filter(
                change_request_id=self.kwargs.get("pk"),
                change_request__requirement_id=self.kwargs.get("requirement_id"),
                change_request__requirement__workspace__slug=self.workspace_slug,
                target_kind=RequirementChangeTargetKind.DETAIL_DATA,
            )
            .order_by("proposed_sort_order", "created_at", "id")
        )

    def list(self, request, slug, requirement_id, pk):
        requirement = self.resolve_requirement()
        if requirement is None:
            return self.not_found()
        queryset = self.get_queryset()
        change_type = request.query_params.get("change_type")
        if change_type:
            if change_type not in RequirementChangeType.values:
                return Response(
                    {"change_type": "This change type is not supported."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            queryset = queryset.filter(change_type=change_type)
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda results: RequirementChangeItemSerializer(
                results, many=True
            ).data,
            default_per_page=DEFAULT_PER_PAGE,
            max_per_page=MAX_PER_PAGE,
        )


class RequirementVersionViewSet(RequirementScopedMixin, BaseViewSet):
    model = RequirementVersion
    serializer_class = RequirementVersionSerializer

    def get_queryset(self):
        return (
            RequirementVersion.objects.filter(
                requirement_id=self.kwargs.get("requirement_id"),
                requirement__workspace__slug=self.workspace_slug,
                target_kind=RequirementChangeTargetKind.REQUIREMENT,
            )
            .select_related("created_by", "change_request")
            .order_by("-version")
        )

    def _get_version(self, version):
        return self.get_queryset().filter(version=version).first()

    @staticmethod
    def version_not_found():
        return Response(
            {"error": "Requirement version not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    def list(self, request, slug, requirement_id):
        requirement = self.resolve_requirement()
        if requirement is None:
            return self.not_found()
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda results: RequirementVersionSerializer(
                results, many=True
            ).data,
            default_per_page=DEFAULT_PER_PAGE,
            max_per_page=MAX_PER_PAGE,
        )

    def retrieve(self, request, slug, requirement_id, version):
        requirement = self.resolve_requirement()
        if requirement is None:
            return self.not_found()
        requirement_version = self._get_version(version)
        if requirement_version is None:
            return self.version_not_found()
        return Response(
            RequirementVersionDetailSerializer(requirement_version).data,
            status=status.HTTP_200_OK,
        )

    def details(self, request, slug, requirement_id, version):
        requirement = self.resolve_requirement()
        if requirement is None:
            return self.not_found()
        requirement_version = self._get_version(version)
        if requirement_version is None:
            return self.version_not_found()
        rows = (requirement_version.snapshot or {}).get("details") or []
        return paginate_sequence(self, request, rows)

    def _compare_versions(self, request, from_version, to_version):
        change_type = request.query_params.get("change_type")
        if change_type and change_type not in RequirementChangeType.values:
            return Response(
                {"change_type": "This change type is not supported."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        comparison = build_version_comparison(
            before=from_version.snapshot or {},
            after=to_version.snapshot or {},
            from_version=from_version.version,
            to_version=to_version.version,
        )
        detail_items = comparison.pop("detail_items")
        if change_type:
            detail_items = [
                item for item in detail_items if item["change_type"] == change_type
            ]

        response = paginate_sequence(self, request, detail_items)
        response.data["results"] = RequirementVersionComparisonItemSerializer(
            response.data["results"], many=True
        ).data
        response.data.update(
            RequirementVersionComparisonSerializer(comparison).data
        )
        return response

    def compare_current(self, request, slug, requirement_id, version):
        requirement = self.resolve_requirement()
        if requirement is None:
            return self.not_found()
        if requirement.current_version is None:
            return Response(
                {
                    "error": "The requirement has not been published.",
                    "code": "REQUIREMENT_NOT_PUBLISHED",
                },
                status=status.HTTP_409_CONFLICT,
            )

        from_version = self._get_version(version)
        to_version = self._get_version(requirement.current_version)
        if from_version is None or to_version is None:
            return self.version_not_found()
        return self._compare_versions(request, from_version, to_version)

    def compare(self, request, slug, requirement_id, version):
        """任意两版对比：?to_version=<int> 指定目标版本，缺省时与当前已发布版本对比。"""
        requirement = self.resolve_requirement()
        if requirement is None:
            return self.not_found()

        to_version_param = request.query_params.get("to_version")
        if to_version_param is None:
            if requirement.current_version is None:
                return Response(
                    {
                        "error": "The requirement has not been published.",
                        "code": "REQUIREMENT_NOT_PUBLISHED",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            to_version_number = requirement.current_version
        else:
            try:
                to_version_number = int(to_version_param)
            except (TypeError, ValueError):
                return Response(
                    {"to_version": "A valid integer is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        from_version = self._get_version(version)
        to_version = self._get_version(to_version_number)
        if from_version is None or to_version is None:
            return self.version_not_found()
        if from_version.pk == to_version.pk:
            return Response(
                {"to_version": "Choose two different versions to compare."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return self._compare_versions(request, from_version, to_version)

    def rollback(self, request, slug, requirement_id, version):
        try:
            with transaction.atomic():
                requirement, error = self.requirement_for_write(for_update=True)
                if error is not None:
                    return error
                requirement_version = self._get_version(version)
                if requirement_version is None:
                    return self.version_not_found()
                rollback_to_version(
                    requirement=requirement,
                    version=requirement_version,
                    actor=request.user,
                )
        except RequirementChangeError as exc:
            return change_error_response(exc)
        return Response(
            {"requirement": self.requirement_payload(requirement)},
            status=status.HTTP_200_OK,
        )
