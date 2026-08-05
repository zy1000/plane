"""产品需求：基线配置 + 需求条目。

需求条目本身没有状态，能不能写完全看所属基线；基线是惰性创建的，产品第一次打开
需求页时才落库。
"""

from django.db.models import Prefetch
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.requirement import (
    RequirementBaselineConfigurationWriteSerializer,
    RequirementBaselineSerializer,
    RequirementConfigurationConflict,
)
from plane.app.views.base import BaseAPIView
from plane.app.views.requirement.library_item import get_scoped_library
from plane.app.views.requirement.mixins import (
    RequirementDraftDispatchMixin,
    can_write_baseline,
    get_scoped_baseline,
    resolve_requirement_fields,
    resolve_row_layer,
)
from plane.app.views.requirement.row_base import BaseRequirementRowViewSet
from plane.db.models import (
    Requirement,
    RequirementApprover,
    RequirementBaseline,
    RequirementChangeApproval,
    RequirementChangeRequest,
    RequirementChangeStatus,
)
from plane.utils.requirement import (
    field_tree_from_specs,
    requirement_grid_expected_updated_at,
    requirement_types_field_payload_from_specs,
)


def pending_change_requests():
    """待审批的变更单（含审批记录），供基线序列化器判断「待我审批」。"""
    return (
        RequirementChangeRequest.objects.filter(status=RequirementChangeStatus.PENDING)
        .order_by("-created_at")
        .prefetch_related(
            Prefetch(
                "approvals",
                queryset=RequirementChangeApproval.objects.order_by(
                    "created_at", "id"
                ),
            )
        )
    )


def baseline_with_relations(baseline_id):
    return (
        RequirementBaseline.objects.filter(id=baseline_id)
        .select_related("workspace", "product", "project", "owner")
        .prefetch_related(
            Prefetch(
                "approvers",
                queryset=RequirementApprover.objects.select_related(
                    "approver"
                ).order_by("sort_order", "created_at", "id"),
            ),
            Prefetch(
                "change_requests",
                queryset=pending_change_requests(),
                to_attr="pending_change_requests",
            ),
        )
        .get()
    )


class RequirementBaselineConfigurationAPIView(
    RequirementDraftDispatchMixin, BaseAPIView
):
    """基线配置：状态、负责人、审批规则，以及网格要用的字段与需求类型视图。"""

    def _response_payload(self, baseline):
        baseline = baseline_with_relations(baseline.id)
        draft = self.draft_for_read(baseline)
        payload = {
            "baseline": RequirementBaselineSerializer(
                baseline,
                context={
                    "request": self.request,
                    "workspace": baseline.workspace,
                },
            ).data,
        }

        # 一个产品下的需求可能分属多个类型：requirement_types 供数据页分视图，
        # fields 保留成扁平并集，让变更记录与版本对比这两个 tab 完全不用改。
        (
            requirement_type_ids,
            specs,
            by_requirement_type,
            is_frozen,
        ) = resolve_requirement_fields(baseline=baseline, draft=draft)
        payload["requirement_types"] = requirement_types_field_payload_from_specs(
            requirement_type_ids, by_requirement_type
        )
        payload["fields"] = field_tree_from_specs(specs)
        payload["is_frozen"] = is_frozen
        payload["expected_updated_at"] = requirement_grid_expected_updated_at(
            owner=baseline, requirement_type_ids=requirement_type_ids
        )
        return payload

    def get(self, request, slug, product_id):
        product, baseline = get_scoped_baseline(
            request.user, slug=slug, product_id=product_id, create=True
        )
        if product is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(self._response_payload(baseline), status=status.HTTP_200_OK)

    def put(self, request, slug, product_id):
        product, baseline = get_scoped_baseline(
            request.user, slug=slug, product_id=product_id, create=True
        )
        if product is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_write_baseline(request.user, product):
            return Response(
                {
                    "error": (
                        "You do not have permission to maintain product requirements."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        read_only = self.read_only_response(baseline)
        if read_only is not None:
            return read_only
        serializer = RequirementBaselineConfigurationWriteSerializer(
            data=request.data,
            context={
                "request": request,
                "workspace": baseline.workspace,
                "baseline": baseline,
            },
        )
        serializer.is_valid(raise_exception=True)
        try:
            baseline = serializer.save()
        except RequirementConfigurationConflict:
            return Response(
                {
                    "error": "The baseline was updated by another request.",
                    "code": "REQUIREMENT_CONFIGURATION_CONFLICT",
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            self._response_payload(baseline),
            status=status.HTTP_200_OK,
        )


class RequirementViewSet(RequirementDraftDispatchMixin, BaseRequirementRowViewSet):
    """产品下的需求条目，按需分派到正式表或工作副本。"""

    NOT_FOUND = "Product not found."
    FORBIDDEN = "You do not have permission to maintain product requirements."

    def resolve_owner(self, *, for_update=False):
        """归属对象是基线 —— 写入路径要保证它存在，读路径也一样（空态才有字段可渲染）。"""
        product, baseline = get_scoped_baseline(
            self.request.user,
            slug=self.workspace_slug,
            product_id=self.kwargs.get("product_id"),
            for_update=for_update,
            create=True,
        )
        if product is None:
            return None
        # can_write 只拿得到 owner，把产品挂上去省一次查询
        baseline.product = product
        return baseline

    def can_write(self, owner):
        return can_write_baseline(self.request.user, owner.product)

    def resolve_layer(self, owner, *, for_write):
        if not for_write:
            return (
                resolve_row_layer(
                    baseline=owner,
                    draft=self.draft_for_read(owner),
                ),
                None,
            )
        read_only = self.read_only_response(owner)
        if read_only is not None:
            return None, read_only
        return (
            resolve_row_layer(
                baseline=owner,
                draft=self.draft_for_write(owner, self.request.user),
            ),
            None,
        )

    def resolve_library(self, library_id):
        return get_scoped_library(
            slug=self.workspace_slug,
            library_id=library_id,
        )

    def get_queryset(self):
        return (
            Requirement.objects.filter(
                product_id=self.kwargs.get("product_id"),
                product__workspace__slug=self.workspace_slug,
            )
            .select_related("product")
            .order_by("sort_order", "created_at", "id")
        )
