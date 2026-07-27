"""草稿层读写分派。

配置与明细两个入口都要对「正式表 / 工作副本」无感：工作副本存在时读写它，否则
读写正式表。工作副本只在需求发过版本之后才存在（见 plane.utils.requirement_draft），
所以「有没有工作副本」本身就是分派依据，不需要再看状态。

状态只决定**能不能写**：published 与 in_review 一律只读。
"""

from typing import NamedTuple

from django.core.exceptions import ValidationError
from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.requirement import (
    RequirementDetailSerializer,
    RequirementDraftDetailSerializer,
)
from plane.db.models import (
    Requirement,
    RequirementDetail,
    RequirementDraftDetail,
    RequirementStatus,
)
from plane.utils.product import can_edit_product_requirements, can_view_product
from plane.utils.requirement import (
    get_requirement_field_specs,
    insert_requirement_detail,
    save_requirement_detail_batch,
)
from plane.utils.requirement_draft import (
    get_draft,
    get_draft_field_specs,
    insert_draft_detail,
    save_draft_detail_batch,
    start_editing,
)


READ_ONLY_REASONS = {
    RequirementStatus.IN_REVIEW: (
        "REQUIREMENT_IN_REVIEW",
        "The requirement is under review and is read-only until the review completes.",
    ),
    RequirementStatus.PUBLISHED: (
        "REQUIREMENT_PUBLISHED",
        "Published content is read-only. Start editing to create a working copy.",
    ),
}


class DetailLayer(NamedTuple):
    """一层明细数据的读写入口，正式表与草稿层各给一份。"""

    queryset: object
    serializer_class: type
    serializer_context: dict
    fields: list
    insert: object
    save_batch: object
    hard_delete: bool


def resolve_detail_layer(*, requirement, draft):
    if draft is None:
        return DetailLayer(
            queryset=RequirementDetail.objects.filter(requirement=requirement).order_by(
                "sort_order", "created_at", "id"
            ),
            serializer_class=RequirementDetailSerializer,
            serializer_context={},
            fields=get_requirement_field_specs(requirement),
            insert=lambda **kwargs: insert_requirement_detail(
                requirement=requirement, **kwargs
            ),
            save_batch=lambda **kwargs: save_requirement_detail_batch(
                requirement=requirement, **kwargs
            ),
            hard_delete=False,
        )
    return DetailLayer(
        queryset=RequirementDraftDetail.objects.filter(draft=draft).order_by(
            "sort_order", "created_at", "id"
        ),
        serializer_class=RequirementDraftDetailSerializer,
        serializer_context={"requirement_id": requirement.id},
        fields=get_draft_field_specs(draft),
        insert=lambda **kwargs: insert_draft_detail(draft=draft, **kwargs),
        save_batch=lambda **kwargs: save_draft_detail_batch(draft=draft, **kwargs),
        hard_delete=True,
    )


def get_scoped_requirement(user, *, slug, requirement_id, for_update=False):
    """按工作区与产品可见性解析需求；不存在或不可见都返回 None。"""
    try:
        queryset = (
            Requirement.objects.filter(
                id=requirement_id,
                workspace__slug=slug,
            )
            .filter(Q(is_template=True) | Q(product__isnull=False))
            .select_related("workspace", "product")
        )
        if for_update:
            queryset = queryset.select_for_update(of=("self",))
        requirement = queryset.first()
    except (ValidationError, ValueError):
        return None
    if (
        requirement is not None
        and requirement.product_id
        and not can_view_product(user, requirement.product)
    ):
        return None
    return requirement


def can_write_requirement(user, requirement):
    return not requirement.product_id or can_edit_product_requirements(
        user, requirement.product
    )


class RequirementDraftDispatchMixin:
    @staticmethod
    def draft_for_read(requirement):
        if requirement.is_template:
            return None
        return get_draft(requirement)

    def draft_for_write(self, requirement, actor=None):
        """写路径的分派目标。

        发过版本却没有工作副本时补一份 —— 否则这次写入会直接落到正式表上，把已
        批准的内容改掉。
        """
        if requirement.is_template:
            return None
        draft = get_draft(requirement)
        if draft is None and requirement.current_version is not None:
            draft = start_editing(requirement=requirement, actor=actor)
        return draft

    @staticmethod
    def read_only_response(requirement):
        """不可写时返回 409，可写时返回 None。"""
        if requirement.is_template:
            return None
        reason = READ_ONLY_REASONS.get(requirement.status)
        if reason is None:
            return None
        code, message = reason
        return Response(
            {"error": message, "code": code},
            status=status.HTTP_409_CONFLICT,
        )
