"""草稿层读写分派 + 字段来源解析。

配置与明细两个入口都要对「正式表 / 工作副本」无感：工作副本存在时读写它，否则
读写正式表。工作副本只在需求发过版本之后才存在（见 plane.utils.requirement_draft），
所以「有没有工作副本」本身就是分派依据，不需要再看状态。

状态只决定**能不能写**：published 与 in_review 一律只读。

字段来源有三态（见 resolve_requirement_fields）：可编辑时实时取自被引用的模板，
已发布时取自版本里冻结的快照。
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
    detail_grid_expected_updated_at,
    field_specs_for_templates,
    field_specs_from_tree,
    get_published_field_tree,
    get_referenced_template_ids,
    get_template_field_specs,
    import_library_items,
    insert_requirement_detail,
    save_requirement_detail_batch,
    uses_change_flow,
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


class DetailTemplateResolver:
    """按 template_id 解析模板并缓存它的字段 spec。

    只在**新增行**时用得到 —— 更新走行上已存的 template_id，绑定创建后不可变。
    """

    def __init__(self, *, workspace_id, allowed_template_id=None):
        self.workspace_id = workspace_id
        self.allowed_template_id = (
            str(allowed_template_id) if allowed_template_id else None
        )
        self._templates = {}
        self._specs = {}

    def resolve(self, template_id):
        key = str(template_id)
        if self.allowed_template_id and key != self.allowed_template_id:
            return None
        if key not in self._templates:
            self._templates[key] = Requirement.objects.filter(
                id=template_id,
                workspace_id=self.workspace_id,
                is_template=True,
                is_active=True,
            ).first()
        return self._templates[key]

    def specs(self, template_id):
        key = str(template_id)
        if key not in self._specs:
            template = self.resolve(template_id)
            self._specs[key] = (
                get_template_field_specs(template) if template is not None else []
            )
        return self._specs[key]


class DetailLayer(NamedTuple):
    """一层明细数据的读写入口，正式表与草稿层各给一份。"""

    queryset: object
    serializer_class: type
    serializer_context: dict
    template_ids: list
    fields: list
    fields_by_template: dict
    template_resolver: object
    default_template_id: object
    expected_updated_at: object
    is_frozen: bool
    insert: object
    save_batch: object
    import_items: object
    hard_delete: bool


def resolve_requirement_fields(*, requirement, draft):
    """返回 (template_ids, 扁平 specs, 按模板分组的 specs, is_frozen)。

    三种态：
    - 有工作副本            -> 按草稿明细引用到的模板实时解析
    - 无工作副本 + 未发布过 -> 按正式明细引用到的模板实时解析
    - 无工作副本 + 已发布   -> 按当前版本里冻结的字段树解析（只读渲染）

    三条分支产出的形状完全一致，所以下游的筛选、搜索、校验、序列化都不用分支。
    """
    if draft is not None:
        template_ids = get_referenced_template_ids(
            model=RequirementDraftDetail, scope={"draft": draft}
        )
        flat, by_template = field_specs_for_templates(template_ids)
        return template_ids, flat, by_template, False

    if requirement.current_version is not None:
        specs = field_specs_from_tree(get_published_field_tree(requirement))
        by_template = {}
        for spec in specs:
            by_template.setdefault(spec.template_id, []).append(spec)
        template_ids = list(by_template.keys())
        return template_ids, specs, by_template, True

    template_ids = get_referenced_template_ids(
        model=RequirementDetail, scope={"requirement": requirement}
    )
    flat, by_template = field_specs_for_templates(template_ids)
    return template_ids, flat, by_template, False


def resolve_detail_layer(*, requirement, draft):
    template_ids, fields, fields_by_template, is_frozen = resolve_requirement_fields(
        requirement=requirement, draft=draft
    )
    resolver = DetailTemplateResolver(workspace_id=requirement.workspace_id)
    expected_updated_at = detail_grid_expected_updated_at(
        owner=requirement, template_ids=template_ids
    )

    if draft is None:
        return DetailLayer(
            queryset=RequirementDetail.objects.filter(requirement=requirement).order_by(
                "sort_order", "created_at", "id"
            ),
            serializer_class=RequirementDetailSerializer,
            serializer_context={},
            template_ids=template_ids,
            fields=fields,
            fields_by_template=fields_by_template,
            template_resolver=resolver,
            default_template_id=None,
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
        template_ids=template_ids,
        fields=fields,
        fields_by_template=fields_by_template,
        template_resolver=resolver,
        default_template_id=None,
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
        if not uses_change_flow(requirement):
            return None
        return get_draft(requirement)

    def draft_for_write(self, requirement, actor=None):
        """写路径的分派目标。

        发过版本却没有工作副本时补一份 —— 否则这次写入会直接落到正式表上，把已
        批准的内容改掉。
        """
        if not uses_change_flow(requirement):
            return None
        draft = get_draft(requirement)
        if draft is None and requirement.current_version is not None:
            draft = start_editing(requirement=requirement, actor=actor)
        return draft

    @staticmethod
    def read_only_response(requirement):
        """不可写时返回 409，可写时返回 None。"""
        if not uses_change_flow(requirement):
            return None
        reason = READ_ONLY_REASONS.get(requirement.status)
        if reason is None:
            return None
        code, message = reason
        return Response(
            {"error": message, "code": code},
            status=status.HTTP_409_CONFLICT,
        )
