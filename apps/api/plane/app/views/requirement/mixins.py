"""草稿层读写分派 + 字段来源解析。

配置与需求条目两个入口都要对「正式表 / 工作副本」无感：工作副本存在时读写它，否则
读写正式表。工作副本只在基线发过版本之后才存在（见 plane.utils.requirement_draft），
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
    RequirementDraftRowSerializer,
    RequirementSerializer,
)
from plane.db.models import (
    Product,
    Requirement,
    RequirementBaseline,
    RequirementDraftRow,
    RequirementStatus,
    RequirementType,
)
from plane.utils.product import can_edit_product_requirements, can_view_product
from plane.utils.requirement import (
    baseline_row_scope,
    builtin_ids_from_specs,
    field_specs_for_requirement_types,
    field_specs_from_tree,
    get_published_field_tree,
    get_referenced_requirement_type_ids,
    get_requirement_type_field_specs,
    import_library_items,
    insert_baseline_requirement,
    requirement_grid_expected_updated_at,
    save_baseline_requirement_batch,
)
from plane.utils.requirement_draft import (
    get_draft,
    import_draft_library_items,
    insert_draft_row,
    save_draft_row_batch,
    start_editing,
)


READ_ONLY_REASONS = {
    RequirementStatus.IN_REVIEW: (
        "REQUIREMENT_IN_REVIEW",
        "The baseline is under review and is read-only until the review completes.",
    ),
    RequirementStatus.PUBLISHED: (
        "REQUIREMENT_PUBLISHED",
        "Published content is read-only. Start editing to create a working copy.",
    ),
}

# 相对上一个已发布版本的变更标记，前端网格的「变更」列直接渲染它
CHANGE_KIND_CREATED = "created"
CHANGE_KIND_UPDATED = "updated"


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


class RowLayer(NamedTuple):
    """一层需求行的读写入口，正式表与草稿层各给一份。"""

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
    annotate_change_kind: object


def builtin_ids_by_type(fields_by_requirement_type):
    """{requirement_type_id: {builtin_key: field_id}}，供序列化时合并列值。"""
    return {
        str(requirement_type_id): builtin_ids_from_specs(specs)
        for requirement_type_id, specs in (fields_by_requirement_type or {}).items()
    }


def resolve_requirement_fields(*, baseline, draft):
    """返回 (requirement_type_ids, 扁平 specs, 按类型分组的 specs, is_frozen)。

    三种态：
    - 有工作副本            -> 按草稿行引用到的需求类型实时解析
    - 无工作副本 + 未发布过 -> 按正式行引用到的需求类型实时解析
    - 无工作副本 + 已发布   -> 按当前版本里冻结的字段树解析（只读渲染）

    三条分支产出的形状完全一致，所以下游的筛选、搜索、校验、序列化都不用分支。
    """
    if draft is not None:
        requirement_type_ids = get_referenced_requirement_type_ids(
            model=RequirementDraftRow, scope={"draft": draft}
        )
        flat, by_type = field_specs_for_requirement_types(requirement_type_ids)
        return requirement_type_ids, flat, by_type, False

    if baseline.current_version is not None:
        specs = field_specs_from_tree(get_published_field_tree(baseline))
        by_type = {}
        for spec in specs:
            by_type.setdefault(spec.requirement_type_id, []).append(spec)
        requirement_type_ids = list(by_type.keys())
        return requirement_type_ids, specs, by_type, True

    requirement_type_ids = get_referenced_requirement_type_ids(
        model=Requirement, scope=baseline_row_scope(baseline)
    )
    flat, by_type = field_specs_for_requirement_types(requirement_type_ids)
    return requirement_type_ids, flat, by_type, False


def _row_content(row):
    return (row.title or "", row.description_html or "", row.data or {})


def _draft_change_kind_annotator(baseline):
    """草稿行相对正式表（也就是最后一次批准通过的内容）的变更标记。

    只比对当前这一页的行，成本随页大小而不是总行数增长。
    """

    def annotate(rows):
        rows = list(rows)
        if not rows:
            return rows
        published = {
            row.id: _row_content(row)
            for row in Requirement.objects.filter(
                id__in=[row.id for row in rows], **baseline_row_scope(baseline)
            ).only("id", "title", "description_html", "data")
        }
        for row in rows:
            previous = published.get(row.id)
            if previous is None:
                row.change_kind = CHANGE_KIND_CREATED
            elif previous != _row_content(row):
                row.change_kind = CHANGE_KIND_UPDATED
            else:
                row.change_kind = None
        return rows

    return annotate


def _formal_change_kind_annotator(baseline):
    """正式表本身就是已发布内容，除非这条基线还从未发布过 —— 那整批都是新增。"""
    never_published = baseline.current_version is None

    def annotate(rows):
        rows = list(rows)
        for row in rows:
            row.change_kind = CHANGE_KIND_CREATED if never_published else None
        return rows

    return annotate


def resolve_row_layer(*, baseline, draft):
    (
        requirement_type_ids,
        fields,
        fields_by_requirement_type,
        is_frozen,
    ) = resolve_requirement_fields(baseline=baseline, draft=draft)
    resolver = RequirementTypeResolver(workspace_id=baseline.workspace_id)
    expected_updated_at = requirement_grid_expected_updated_at(
        owner=baseline, requirement_type_ids=requirement_type_ids
    )
    serializer_context = {
        "builtin_field_ids_by_type": builtin_ids_by_type(fields_by_requirement_type),
        "product_id": baseline.product_id,
        "project_id": baseline.project_id,
    }

    if draft is None:
        return RowLayer(
            queryset=Requirement.objects.filter(
                **baseline_row_scope(baseline)
            ).order_by("sort_order", "created_at", "id"),
            serializer_class=RequirementSerializer,
            serializer_context=serializer_context,
            requirement_type_ids=requirement_type_ids,
            fields=fields,
            fields_by_requirement_type=fields_by_requirement_type,
            requirement_type_resolver=resolver,
            default_requirement_type_id=None,
            expected_updated_at=expected_updated_at,
            is_frozen=is_frozen,
            insert=lambda **kwargs: insert_baseline_requirement(
                baseline=baseline, **kwargs
            ),
            save_batch=lambda **kwargs: save_baseline_requirement_batch(
                baseline=baseline, **kwargs
            ),
            import_items=lambda **kwargs: import_library_items(
                baseline=baseline, **kwargs
            ),
            hard_delete=False,
            annotate_change_kind=_formal_change_kind_annotator(baseline),
        )
    return RowLayer(
        queryset=RequirementDraftRow.objects.filter(draft=draft).order_by(
            "sort_order", "created_at", "id"
        ),
        serializer_class=RequirementDraftRowSerializer,
        serializer_context=serializer_context,
        requirement_type_ids=requirement_type_ids,
        fields=fields,
        fields_by_requirement_type=fields_by_requirement_type,
        requirement_type_resolver=resolver,
        default_requirement_type_id=None,
        expected_updated_at=expected_updated_at,
        is_frozen=is_frozen,
        insert=lambda **kwargs: insert_draft_row(draft=draft, **kwargs),
        save_batch=lambda **kwargs: save_draft_row_batch(draft=draft, **kwargs),
        import_items=lambda **kwargs: import_draft_library_items(
            draft=draft, **kwargs
        ),
        hard_delete=True,
        annotate_change_kind=_draft_change_kind_annotator(baseline),
    )


def get_scoped_product(user, *, slug, product_id):
    """按工作区与可见性解析产品；不存在或不可见都返回 None。"""
    try:
        product = (
            Product.objects.filter(id=product_id, workspace__slug=slug)
            .select_related("workspace")
            .prefetch_related("reviewers")
            .first()
        )
    except (ValidationError, ValueError):
        return None
    if product is None or not can_view_product(user, product):
        return None
    return product


def get_scoped_baseline(user, *, slug, product_id, for_update=False, create=False):
    """解析产品的需求基线。

    基线是惰性创建的：产品刚建出来时并没有基线行，第一次打开需求页（GET 配置）或
    第一次写入时才落库。create=False 时返回 (product, None)，调用方按需决定是报
    404 还是给一份空态。
    """
    product = get_scoped_product(user, slug=slug, product_id=product_id)
    if product is None:
        return None, None

    queryset = RequirementBaseline.objects.filter(product=product).select_related(
        "workspace", "product", "owner"
    )
    if for_update:
        queryset = queryset.select_for_update(of=("self",))
    baseline = queryset.first()
    if baseline is None and create:
        baseline = RequirementBaseline.objects.create(
            product=product,
            workspace_id=product.workspace_id,
            owner=user,
            created_by=user,
        )
        baseline = queryset.first() or baseline
    return product, baseline


def can_write_baseline(user, product):
    return can_edit_product_requirements(user, product)


class RequirementDraftDispatchMixin:
    @staticmethod
    def draft_for_read(baseline):
        return get_draft(baseline)

    def draft_for_write(self, baseline, actor=None):
        """写路径的分派目标。

        发过版本却没有工作副本时补一份 —— 否则这次写入会直接落到正式表上，把已
        批准的内容改掉。
        """
        draft = get_draft(baseline)
        if draft is None and baseline.current_version is not None:
            draft = start_editing(baseline=baseline, actor=actor)
        return draft

    @staticmethod
    def read_only_response(baseline):
        """不可写时返回 409，可写时返回 None。"""
        reason = READ_ONLY_REASONS.get(baseline.status)
        if reason is None:
            return None
        code, message = reason
        return Response(
            {"error": message, "code": code},
            status=status.HTTP_409_CONFLICT,
        )
