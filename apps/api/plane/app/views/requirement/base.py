"""产品需求：审批配置 + 需求条目。

审批配置只回答「谁能批、要几个人批」；能不能写一条需求由那一行自己决定（在不在评审
中），不再有产品级的冻结闸门。配置是惰性创建的，产品第一次打开需求页时才落库。
"""

from django.db import transaction
from django.db.models import Prefetch
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.requirement import (
    RequirementApprovalPolicySerializer,
    RequirementApprovalPolicyWriteSerializer,
    RequirementConfigurationConflict,
    RequirementRollbackSerializer,
    RequirementSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.app.views.requirement.library_item import get_scoped_library
from plane.app.views.requirement.mixins import (
    can_manage_policy,
    can_write_requirements,
    get_scoped_policy,
    resolve_row_layer,
)
from plane.app.views.requirement.row_base import BaseRequirementRowViewSet
from plane.db.models import (
    Requirement,
    RequirementApprovalPolicy,
    RequirementApprover,
)
from plane.utils.requirement_change import (
    RequirementChangeError,
    rollback_requirement_to_version,
)
from plane.utils.requirement import (
    field_specs_for_requirement_types,
    field_tree_from_specs,
    get_referenced_requirement_type_ids,
    requirement_types_field_payload_from_specs,
    scope_row_filter,
)


def policy_with_relations(policy_id):
    return (
        RequirementApprovalPolicy.objects.filter(id=policy_id)
        .select_related("workspace", "product", "project", "owner")
        .prefetch_related(
            Prefetch(
                "approvers",
                queryset=RequirementApprover.objects.select_related(
                    "approver"
                ).order_by("sort_order", "created_at", "id"),
            ),
        )
        .get()
    )


class RequirementConfigurationAPIView(BaseAPIView):
    """需求配置：审批规则 + 网格要用的字段与需求类型视图。

    字段一律实时取自被引用的需求类型 —— 没有 is_frozen 这个态了，字段结构变更立即
    生效，历史版本的渲染依据由 RequirementTypeSchemaRevision 保住。
    """

    def _response_payload(self, policy):
        policy = policy_with_relations(policy.id)
        payload = {
            "policy": RequirementApprovalPolicySerializer(
                policy,
                context={
                    "request": self.request,
                    "workspace": policy.workspace,
                },
            ).data,
        }

        # 一个产品下的需求可能分属多个类型：requirement_types 供数据页分视图，
        # fields 保留成扁平并集，让变更记录那个 tab 完全不用改。
        requirement_type_ids = get_referenced_requirement_type_ids(
            model=Requirement, scope=scope_row_filter(policy)
        )
        specs, by_requirement_type = field_specs_for_requirement_types(
            requirement_type_ids
        )
        payload["requirement_types"] = requirement_types_field_payload_from_specs(
            requirement_type_ids, by_requirement_type
        )
        payload["fields"] = field_tree_from_specs(specs)
        return payload

    def get(self, request, slug, product_id):
        product, policy = get_scoped_policy(
            request.user, slug=slug, product_id=product_id, create=True
        )
        if product is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(self._response_payload(policy), status=status.HTTP_200_OK)

    def put(self, request, slug, product_id):
        product, policy = get_scoped_policy(
            request.user, slug=slug, product_id=product_id, create=True
        )
        if product is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        # 比「能改需求」更窄：配置不再受审批保护，两者相同的话任何能提交的人都可以先把
        # 审批人改成自己再批自己的单。
        if not can_manage_policy(request.user, product):
            return Response(
                {
                    "error": (
                        "You do not have permission to manage the requirement "
                        "approval policy."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RequirementApprovalPolicyWriteSerializer(
            data=request.data,
            context={
                "request": request,
                "workspace": policy.workspace,
                "policy": policy,
            },
        )
        serializer.is_valid(raise_exception=True)
        try:
            policy = serializer.save()
        except RequirementConfigurationConflict:
            return Response(
                {
                    "error": "The approval policy was updated by another request.",
                    "code": "REQUIREMENT_CONFIGURATION_CONFLICT",
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            self._response_payload(policy),
            status=status.HTTP_200_OK,
        )


class RequirementViewSet(BaseRequirementRowViewSet):
    """产品下的需求条目。"""

    NOT_FOUND = "Product not found."
    FORBIDDEN = "You do not have permission to maintain product requirements."

    def resolve_owner(self, *, for_update=False):
        """归属对象是审批配置 —— 它同时携带作用域，读写两条路径都要它存在。"""
        product, policy = get_scoped_policy(
            self.request.user,
            slug=self.workspace_slug,
            product_id=self.kwargs.get("product_id"),
            for_update=for_update,
            create=True,
        )
        if product is None:
            return None
        # can_write 只拿得到 owner，把产品挂上去省一次查询
        policy.product = product
        return policy

    def can_write(self, owner):
        return can_write_requirements(self.request.user, owner.product)

    def resolve_layer(self, owner):
        return resolve_row_layer(owner)

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

    def rollback(self, request, *args, pk=None, **kwargs):
        """把某个已通过版本的内容拷回这一行。

        回滚**不撤销审批**：写完这条需求是 modified，要不要真的退回那一版由随后的评审
        决定。所以这里走的是普通的写权限，与 PATCH 一致。
        """
        serializer = RequirementRollbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        owner, error = self._owner_or_error()
        if error is not None:
            return error
        layer = self.resolve_layer(owner)
        with transaction.atomic():
            row = layer.queryset.select_for_update().filter(id=pk).first()
            if row is None:
                return Response(
                    {"error": "Requirement not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            try:
                rollback_requirement_to_version(
                    requirement=row,
                    version_number=serializer.validated_data["version"],
                    actor=request.user,
                )
            except RequirementChangeError as exc:
                payload = {"error": str(exc), "code": exc.code}
                payload.update(exc.detail or {})
                return Response(payload, status=status.HTTP_409_CONFLICT)
        return Response(
            RequirementSerializer(
                row, context=self._serializer_context(layer, owner)
            ).data,
            status=status.HTTP_200_OK,
        )
