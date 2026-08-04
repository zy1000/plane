"""草稿层读写分派 + 字段来源解析。

配置与明细两个入口都要对「正式表 / 工作副本」无感：工作副本存在时读写它，否则
读写正式表。工作副本只在需求发过版本之后才存在（见 plane.utils.requirement_draft），
所以「有没有工作副本」本身就是分派依据，不需要再看状态。

状态只决定**能不能写**：published 与 in_review 一律只读。

字段来源有三态（见 resolve_requirement_fields）：可编辑时实时取自被引用的需求
类型，已发布时取自版本里冻结的快照。
"""

from typing import NamedTuple

from django.core.exceptions import ValidationError
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
    RequirementType,
)
from plane.utils.product import can_edit_product_requirements, can_view_product
from plane.utils.requirement import (
    detail_grid_expected_updated_at,
    field_specs_for_requirement_types,
    field_specs_from_tree,
    get_published_field_tree,
    get_referenced_requirement_type_ids,
    get_requirement_type_field_specs,
    import_library_items,
    insert_requirement_detail,
    save_requirement_detail_batch,
)
from plane.utils.requirement_draft import (
    get_draft,
    import_draft_library_items,
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


class RequirementTypeResolver:
    """按 requirement_type_id 解析需求类型并缓存它的字段 spec。

    只在**新增行**时用得到 —— 更新走行上已存的 requirement_type_id，绑定创建后
    不可变。
    """

    def __init__(self, *, workspace_id, allowed_requirement_type_id=None):
        self.workspace_id = workspace_id
        self.allowed_requirement_type_id = (
            str(allowed_requirement_type_id) if allowed_requirement_type_id else None
        )
        self._requirement_types = {}
        self._specs = {}

    def resolve(self, requirement_type_id):
        key = str(requirement_type_id)
        if (
            self.allowed_requirement_type_id
            and key != self.allowed_requirement_type_id
        ):
            return None
        if key not in self._requirement_types:
            self._requirement_types[key] = RequirementType.objects.filter(
                id=requirement_type_id,
                workspace_id=self.workspace_id,
                is_active=True,
            ).first()
        return self._requirement_types[key]

    def specs(self, requirement_type_id):
        key = str(requirement_type_id)
        if key not in self._specs:
            requirement_type = self.resolve(requirement_type_id)
            self._specs[key] = (
                get_requirement_type_field_specs(requirement_type)
                if requirement_type is not None
                else []
            )
        return self._specs[key]


class DetailLayer(NamedTuple):
    """一层明细数据的读写入口，正式表与草稿层各给一份。"""

    queryset: object
    serializer_class: type
    serializer_context: dict
    requirement_type_ids: list
    fields: list
    fields_by_requirement_type: dict
    requirement_type_resolver: object
    default_requirement_type_id: object
    expected_updated_at: object
    is_frozen: bool
    insert: object
    save_batch: object
    import_items: object
    hard_delete: bool


def resolve_requirement_fields(*, requirement, draft):
    """返回 (requirement_type_ids, 扁平 specs, 按类型分组的 specs, is_frozen)。

    三种态：
    - 有工作副本            -> 按草稿明细引用到的需求类型实时解析
    - 无工作副本 + 未发布过 -> 按正式明细引用到的需求类型实时解析
    - 无工作副本 + 已发布   -> 按当前版本里冻结的字段树解析（只读渲染）

    三条分支产出的形状完全一致，所以下游的筛选、搜索、校验、序列化都不用分支。
    """
    if draft is not None:
        requirement_type_ids = get_referenced_requirement_type_ids(
            model=RequirementDraftDetail, scope={"draft": draft}
        )
        flat, by_type = field_specs_for_requirement_types(requirement_type_ids)
        return requirement_type_ids, flat, by_type, False

    if requirement.current_version is not None:
        specs = field_specs_from_tree(get_published_field_tree(requirement))
        by_type = {}
        for spec in specs:
            by_type.setdefault(spec.requirement_type_id, []).append(spec)
        requirement_type_ids = list(by_type.keys())
        return requirement_type_ids, specs, by_type, True

    requirement_type_ids = get_referenced_requirement_type_ids(
        model=RequirementDetail, scope={"requirement": requirement}
    )
    flat, by_type = field_specs_for_requirement_types(requirement_type_ids)
    return requirement_type_ids, flat, by_type, False


def resolve_detail_layer(*, requirement, draft):
    (
        requirement_type_ids,
        fields,
        fields_by_requirement_type,
        is_frozen,
    ) = resolve_requirement_fields(requirement=requirement, draft=draft)
    resolver = RequirementTypeResolver(workspace_id=requirement.workspace_id)
    expected_updated_at = detail_grid_expected_updated_at(
        owner=requirement, requirement_type_ids=requirement_type_ids
    )

    if draft is None:
        return DetailLayer(
            queryset=RequirementDetail.objects.filter(requirement=requirement).order_by(
                "sort_order", "created_at", "id"
            ),
            serializer_class=RequirementDetailSerializer,
            serializer_context={},
            requirement_type_ids=requirement_type_ids,
            fields=fields,
            fields_by_requirement_type=fields_by_requirement_type,
            requirement_type_resolver=resolver,
            default_requirement_type_id=None,
            expected_updated_at=expected_updated_at,
            is_frozen=is_frozen,
            insert=lambda **kwargs: insert_requirement_detail(
                requirement=requirement, **kwargs
            ),
            save_batch=lambda **kwargs: save_requirement_detail_batch(
                requirement=requirement, **kwargs
            ),
            import_items=lambda **kwargs: import_library_items(
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
        requirement_type_ids=requirement_type_ids,
        fields=fields,
        fields_by_requirement_type=fields_by_requirement_type,
        requirement_type_resolver=resolver,
        default_requirement_type_id=None,
        expected_updated_at=expected_updated_at,
        is_frozen=is_frozen,
        insert=lambda **kwargs: insert_draft_detail(draft=draft, **kwargs),
        save_batch=lambda **kwargs: save_draft_detail_batch(draft=draft, **kwargs),
        import_items=lambda **kwargs: import_draft_library_items(
            draft=draft, **kwargs
        ),
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
            .filter(product__isnull=False)
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
        return get_draft(requirement)

    def draft_for_write(self, requirement, actor=None):
        """写路径的分派目标。

        发过版本却没有工作副本时补一份 —— 否则这次写入会直接落到正式表上，把已
        批准的内容改掉。
        """
        draft = get_draft(requirement)
        if draft is None and requirement.current_version is not None:
            draft = start_editing(requirement=requirement, actor=actor)
        return draft

    @staticmethod
    def read_only_response(requirement):
        """不可写时返回 409，可写时返回 None。"""
        reason = READ_ONLY_REASONS.get(requirement.status)
        if reason is None:
            return None
        code, message = reason
        return Response(
            {"error": message, "code": code},
            status=status.HTTP_409_CONFLICT,
        )
