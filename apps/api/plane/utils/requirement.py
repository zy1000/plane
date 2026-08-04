from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Optional
from uuid import uuid4

from django.db.models import Q
from django.utils import timezone
from django.utils.html import strip_tags

from plane.app.permissions import ROLE
from plane.db.models import (
    Product,
    ProductMember,
    ProjectMember,
    Requirement,
    RequirementApprover,
    RequirementBuiltinFieldKey,
    RequirementChangeTargetKind,
    RequirementDetail,
    RequirementDraftDetail,
    RequirementField,
    RequirementFieldType,
    RequirementVersion,
    User,
    Workspace,
    WorkspaceMember,
)


SORT_ORDER_STEP = 1000

# 每个需求模板必有的两个字段：(builtin_key, 名称, 字段类型, 是否必填)
BUILTIN_FIELD_DEFS = (
    (RequirementBuiltinFieldKey.TITLE, "标题", RequirementFieldType.TEXT, True),
    (
        RequirementBuiltinFieldKey.DESCRIPTION,
        "描述",
        RequirementFieldType.RICH_TEXT,
        False,
    ),
)


def field_attr(field, name, default=None):
    """统一读取字段属性，兼容三种来源。

    字段可能来自 DB 行（RequirementField / RequirementFieldSpec）或来自草稿
    快照与请求载荷里的 dict，调用方不应该关心具体是哪一种。
    """
    if isinstance(field, dict):
        return field.get(name, default)
    return getattr(field, name, default)


@dataclass(frozen=True)
class RequirementFieldSpec:
    """字段定义的统一形状，桥接「模板表的 DB 行」与「版本快照里的 JSON 树」。

    id / parent_field_id 一律是字符串，让明细 data 里以字段 ID 为 key 的结构在
    两条路径上走同一套索引逻辑。template_id 让扁平并集能重新分组回各自的模板。
    """

    id: str
    parent_field_id: Optional[str]
    name: str
    field_type: str
    is_required: bool
    is_active: bool
    sort_order: float
    config: dict
    default_value: Any = None
    builtin_key: Optional[str] = None
    template_id: Optional[str] = None


def field_specs_from_models(fields):
    return [
        RequirementFieldSpec(
            id=str(field.id),
            parent_field_id=(
                str(field.parent_field_id) if field.parent_field_id else None
            ),
            name=field.name,
            field_type=field.field_type,
            is_required=field.is_required,
            is_active=field.is_active,
            sort_order=field.sort_order,
            config=deepcopy(field.config) or {},
            default_value=deepcopy(field.default_value),
            builtin_key=field.builtin_key,
            # 字段只归模板所有，所以 requirement_id 就是模板 ID
            template_id=str(field.requirement_id),
        )
        for field in fields
    ]


def field_specs_from_tree(tree, *, parent_id=None, template_id=None):
    """把 serialize_requirement_field_tree 形状的嵌套树摊平成 spec 列表。"""
    specs = []
    for index, node in enumerate(tree or []):
        node_id = str(node.get("id") or uuid4())
        node_template_id = node.get("template_id") or template_id
        specs.append(
            RequirementFieldSpec(
                id=node_id,
                parent_field_id=parent_id,
                name=node.get("name") or "",
                field_type=node.get("field_type") or RequirementFieldType.TEXT,
                is_required=bool(node.get("is_required", False)),
                is_active=bool(node.get("is_active", True)),
                sort_order=node.get("sort_order", (index + 1) * SORT_ORDER_STEP),
                config=deepcopy(node.get("config") or {}),
                default_value=deepcopy(node.get("default_value")),
                builtin_key=node.get("builtin_key"),
                template_id=str(node_template_id) if node_template_id else None,
            )
        )
        if node.get("children"):
            specs.extend(
                field_specs_from_tree(
                    node["children"],
                    parent_id=node_id,
                    template_id=node_template_id,
                )
            )
    return specs


def field_tree_from_specs(specs):
    """specs -> 嵌套树，与 serialize_requirement_field_tree 输出同构。

    保持传入顺序，不重新排序 —— 调用方（DB 查询或快照树遍历）已经是有序的。
    """
    children_by_parent = {}
    roots = []
    for spec in specs:
        payload = {
            "id": spec.id,
            "name": spec.name,
            "field_type": spec.field_type,
            "is_required": spec.is_required,
            "is_active": spec.is_active,
            "sort_order": spec.sort_order,
            "config": deepcopy(spec.config),
            "default_value": deepcopy(spec.default_value),
            "builtin_key": spec.builtin_key,
            "template_id": spec.template_id,
            "children": [],
        }
        if spec.parent_field_id:
            children_by_parent.setdefault(spec.parent_field_id, []).append(payload)
        else:
            roots.append(payload)

    for payload in roots:
        payload["children"] = children_by_parent.get(payload["id"], [])
    return roots


class RequirementDataLossError(Exception):
    def __init__(self, affected_detail_count):
        self.affected_detail_count = affected_detail_count
        super().__init__("Saving this field structure will remove existing detail values.")


class RequirementBuiltinFieldError(ValueError):
    """试图删除内置字段，或改它的类型 / 启用状态 / 内置标识。

    单独成类是为了让接口能回一个稳定的 code —— 前端如果是从筛选过的字段列表拼出
    载荷，很容易漏掉内置字段，那在后端看来就是「删除」，光给一句中文很难排查。
    """

    code = "REQUIREMENT_BUILTIN_FIELD_LOCKED"


class RequirementDetailBatchConflict(Exception):
    def __init__(self, conflicts):
        self.conflicts = conflicts
        super().__init__("One or more requirement details changed before the batch was saved.")


def get_requirement_select_mode(field):
    config = field_attr(field, "config") or {}
    return "multiple" if config.get("selection_mode") == "multiple" else "single"


def get_requirement_select_options(field):
    config = field_attr(field, "config") or {}
    options = config.get("options") or []
    return options if isinstance(options, list) else []


def get_requirement_eligible_user_ids(
    *,
    workspace_id,
    user_ids,
    product_id=None,
    project_id=None,
):
    """Return users that can own or approve a requirement in its target scope."""
    candidate_ids = set(user_ids)
    if not candidate_ids:
        return set()

    workspace_member_ids = set(
        WorkspaceMember.objects.filter(
            workspace_id=workspace_id,
            member_id__in=candidate_ids,
            is_active=True,
            deleted_at__isnull=True,
        ).values_list("member_id", flat=True)
    )

    if product_id:
        product = Product.objects.filter(id=product_id).only("owner_id").first()
        product_member_ids = set(
            ProductMember.objects.filter(
                product_id=product_id,
                member_id__in=workspace_member_ids,
            ).values_list("member_id", flat=True)
        )
        privileged_ids = set(
            WorkspaceMember.objects.filter(
                workspace_id=workspace_id,
                member_id__in=workspace_member_ids,
                role=ROLE.ADMIN.value,
                is_active=True,
                deleted_at__isnull=True,
            ).values_list("member_id", flat=True)
        )
        workspace_owner_id = (
            Workspace.objects.filter(id=workspace_id)
            .values_list("owner_id", flat=True)
            .first()
        )
        if workspace_owner_id in candidate_ids:
            privileged_ids.add(workspace_owner_id)
        if product is not None and product.owner_id in candidate_ids:
            privileged_ids.add(product.owner_id)
        return workspace_member_ids.intersection(product_member_ids).union(
            privileged_ids
        )

    if project_id:
        project_member_ids = set(
            ProjectMember.objects.filter(
                project_id=project_id,
                member_id__in=workspace_member_ids,
                is_active=True,
                deleted_at__isnull=True,
            ).values_list("member_id", flat=True)
        )
        return workspace_member_ids.intersection(project_member_ids)

    return workspace_member_ids


def uses_change_flow(requirement):
    """是否走「工作副本 + 变更审批 + 版本」流程。

    只有产品/项目需求走；工作区模板直接编辑直接生效。
    """
    return not requirement.is_template


def details_affected_by_fields(requirement):
    """字段变更会波及的明细行，按模型分组返回 [(model, queryset), ...]。

    只包含**实时引用**该模板的行 —— 标准库条目、还没发布过的产品需求的正式行、
    以及所有工作副本的行。已发布产品需求的正式行不在内：它们渲染的是版本里冻结
    的字段，值不能因为模板改动就被抹掉（模板的改动要走下一次编辑 + 变更审批）。
    """
    if not requirement.is_template:
        return []
    return [
        (
            RequirementDetail,
            RequirementDetail.objects.filter(
                Q(library__isnull=False) | Q(requirement__current_version__isnull=True),
                template=requirement,
            ),
        ),
        (
            RequirementDraftDetail,
            RequirementDraftDetail.objects.filter(template=requirement),
        ),
    ]


def replace_requirement_approvers(*, requirement, approver_ids, actor=None):
    """Replace the active approver list while preserving the submitted order."""
    RequirementApprover.objects.filter(requirement=requirement).delete()
    RequirementApprover.objects.bulk_create(
        [
            RequirementApprover(
                requirement=requirement,
                approver_id=approver_id,
                sort_order=index,
                created_by=actor,
            )
            for index, approver_id in enumerate(approver_ids)
        ]
    )
    if hasattr(requirement, "_prefetched_objects_cache"):
        requirement._prefetched_objects_cache.pop("approvers", None)


def _field_specs_of(owner):
    return field_specs_from_models(
        owner.fields.select_related("parent_field").order_by(
            "sort_order", "created_at", "id"
        )
    )


def get_template_field_specs(template):
    """模板自己的字段定义 —— 字段只归模板所有。"""
    return _field_specs_of(template)


def get_requirement_field_specs(requirement):
    """需求的字段定义。

    模板读自己的；产品需求没有自有字段，读它的明细引用到的那些模板的并集。
    """
    if requirement.is_template:
        return get_template_field_specs(requirement)
    template_ids = get_referenced_template_ids(
        model=RequirementDetail, scope={"requirement": requirement}
    )
    return field_specs_for_templates(template_ids)[0]


def serialize_requirement_field_tree(requirement):
    return field_tree_from_specs(get_requirement_field_specs(requirement))


def get_library_field_specs(library):
    """标准库的字段实时引用所选模板，不拷贝。"""
    return get_template_field_specs(library.template)


def serialize_library_field_tree(library):
    return field_tree_from_specs(get_library_field_specs(library))


def get_referenced_template_ids(*, model, scope):
    """这批明细引用到的模板 ID。

    排序取模板自身的 (sort_order, created_at, id)，而不是「明细里首次出现的顺序」——
    后者会随着行的增删改序而变，让 snapshot["fields"] 无谓地重排，diff 里冒出一堆
    并不存在的字段变更。
    """
    template_ids = (
        model.objects.filter(**scope)
        .exclude(template_id=None)
        .values_list("template_id", flat=True)
        .distinct()
    )
    return list(
        Requirement.objects.filter(id__in=list(template_ids))
        .order_by("sort_order", "created_at", "id")
        .values_list("id", flat=True)
    )


def field_specs_for_templates(template_ids):
    """返回 (扁平并集, 按 template_id 分组)。

    并集给筛选/搜索/变更快照用 —— 字段 UUID 全局唯一，摊平不会撞 key；分组给逐行
    校验用 —— 每行只能用它自己那个模板的字段。
    """
    template_ids = list(template_ids)
    if not template_ids:
        return [], {}

    rows = (
        RequirementField.objects.filter(requirement_id__in=template_ids)
        .select_related("parent_field")
        .order_by("sort_order", "created_at", "id")
    )
    by_template = {}
    for spec in field_specs_from_models(rows):
        by_template.setdefault(spec.template_id, []).append(spec)

    # 保持调用方给定的模板顺序
    flat = []
    ordered_by_template = {}
    for template_id in template_ids:
        key = str(template_id)
        specs = by_template.get(key, [])
        ordered_by_template[key] = specs
        flat.extend(specs)
    return flat, ordered_by_template


def templates_field_payload_from_specs(template_ids, specs_by_template):
    """产品需求配置接口里的 templates[]：每个模板一份 id/title/字段树。

    字段取调用方给的 specs 而不是自己去查库 —— 已发布的需求传进来的是版本里冻结
    的那份，自己查库会把冻结语义直接绕过去。
    """
    template_ids = [str(item) for item in template_ids]
    if not template_ids:
        return []

    titles = {
        str(key): value
        for key, value in Requirement.objects.filter(
            id__in=template_ids
        ).values_list("id", "title")
    }
    payload = []
    for template_id in template_ids:
        specs = specs_by_template.get(template_id, [])
        payload.append(
            {
                "id": template_id,
                "title": titles.get(template_id, ""),
                "fields": field_tree_from_specs(specs),
                # 默认视图要跨模板对齐标题/描述两列，而各模板的字段 UUID 不同
                "builtin_field_ids": {
                    spec.builtin_key: spec.id for spec in specs if spec.builtin_key
                },
            }
        )
    return payload


def get_published_field_tree(requirement):
    """已发布内容的字段树 —— 取当前版本里冻结的那份。

    模板随时可改且不走审批，所以已发布的产品需求不能实时跟随模板，否则已批准的
    内容会被悄悄改掉。返回 [] 表示从未发布过。
    """
    if requirement.current_version is None:
        return []
    snapshot = (
        RequirementVersion.objects.filter(
            requirement=requirement,
            target_kind=RequirementChangeTargetKind.REQUIREMENT,
            version=requirement.current_version,
        )
        .values_list("snapshot", flat=True)
        .first()
    ) or {}
    return deepcopy(snapshot.get("fields") or [])


def detail_grid_expected_updated_at(*, owner, template_ids):
    """明细网格的乐观锁基准。

    必须把模板的 updated_at 算进来：列定义住在模板里，改模板字段不会动需求行，
    只看 owner.updated_at 会让「字段被人改了」这类冲突整个漏过去。标准库的条目
    入口早就是这么做的（见 library_item.py 的注释）。
    """
    stamps = [owner.updated_at]
    if template_ids:
        stamps.extend(
            Requirement.objects.filter(id__in=list(template_ids)).values_list(
                "updated_at", flat=True
            )
        )
    return max(stamp for stamp in stamps if stamp is not None)


def ensure_builtin_fields(*, template, actor=None):
    """保证模板拥有标题与描述两个内置字段。幂等，模板创建时调用。"""
    existing = set(
        RequirementField.objects.filter(
            requirement=template, builtin_key__isnull=False
        ).values_list("builtin_key", flat=True)
    )
    missing = [item for item in BUILTIN_FIELD_DEFS if item[0] not in existing]
    if not missing:
        return

    offset = len(missing) * SORT_ORDER_STEP
    shifted = []
    for index, field in enumerate(
        RequirementField.objects.filter(
            requirement=template, parent_field__isnull=True, builtin_key__isnull=True
        ).order_by("sort_order", "created_at", "id")
    ):
        field.sort_order = offset + (index + 1) * SORT_ORDER_STEP
        shifted.append(field)
    if shifted:
        RequirementField.objects.bulk_update(shifted, ["sort_order"])

    RequirementField.objects.bulk_create(
        [
            RequirementField(
                requirement=template,
                name=name,
                field_type=field_type,
                is_required=is_required,
                is_active=True,
                sort_order=(index + 1) * SORT_ORDER_STEP,
                config={},
                default_value=None,
                builtin_key=builtin_key,
                created_by=actor,
            )
            for index, (builtin_key, name, field_type, is_required) in enumerate(
                missing
            )
        ]
    )


def _clean_detail_data_for_fields(data, removed_fields):
    cleaned = deepcopy(data)
    changed = False
    removed_root_ids = {
        str(field_attr(field, "id"))
        for field in removed_fields
        if field_attr(field, "parent_field_id") is None
    }
    for field_id in removed_root_ids:
        if field_id in cleaned:
            cleaned.pop(field_id, None)
            changed = True

    removed_children_by_parent = {}
    for field in removed_fields:
        parent_field_id = field_attr(field, "parent_field_id")
        if parent_field_id is not None:
            removed_children_by_parent.setdefault(str(parent_field_id), set()).add(
                str(field_attr(field, "id"))
            )

    for parent_id, child_ids in removed_children_by_parent.items():
        rows = cleaned.get(parent_id)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("values"), dict):
                continue
            for child_id in child_ids:
                if child_id in row["values"]:
                    row["values"].pop(child_id, None)
                    changed = True
    return cleaned, changed


def _clear_detail_value_for_field(data, field, empty_value):
    cleaned = deepcopy(data)
    field_id = str(field_attr(field, "id"))
    parent_field_id = field_attr(field, "parent_field_id")
    changed = False

    if parent_field_id is None:
        if not _is_empty_detail_value(cleaned.get(field_id)):
            cleaned[field_id] = deepcopy(empty_value)
            changed = True
        return cleaned, changed

    rows = cleaned.get(str(parent_field_id))
    if not isinstance(rows, list):
        return cleaned, changed
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("values"), dict):
            continue
        if not _is_empty_detail_value(row["values"].get(field_id)):
            row["values"][field_id] = deepcopy(empty_value)
            changed = True
    return cleaned, changed


def select_config_removes_values(field, payload):
    """选择器的模式变化或选项收缩会让已存的值失效。"""
    if (
        field_attr(field, "field_type") != RequirementFieldType.SELECT
        or field_attr(payload, "field_type") != RequirementFieldType.SELECT
    ):
        return False
    old_ids = {
        str(option.get("id"))
        for option in get_requirement_select_options(field)
        if isinstance(option, dict) and option.get("id")
    }
    new_ids = {
        str(option.get("id"))
        for option in get_requirement_select_options(payload)
        if isinstance(option, dict) and option.get("id")
    }
    return (
        get_requirement_select_mode(field) != get_requirement_select_mode(payload)
        or not old_ids.issubset(new_ids)
    )


def apply_field_change_cleanup(
    *,
    details,
    removed_fields,
    reset_select_fields,
    actor=None,
):
    """清掉因字段被删除 / 换类型 / 选项收缩而失效的明细值。

    正式表与草稿表的行结构一致（data / version / updated_by），所以两条路径
    共用这一份逻辑；调用方各自对自己的模型做 bulk_update。
    """
    changed_details = []
    if not removed_fields and not reset_select_fields:
        return changed_details

    now = timezone.now()
    for detail in details:
        cleaned_data, changed = _clean_detail_data_for_fields(
            detail.data, removed_fields
        )
        for field, empty_value in reset_select_fields:
            cleaned_data, select_changed = _clear_detail_value_for_field(
                cleaned_data,
                field,
                empty_value,
            )
            changed = changed or select_changed
        if changed:
            detail.data = cleaned_data
            detail.version += 1
            detail.updated_at = now
            detail.updated_by = actor
            changed_details.append(detail)
    return changed_details


def sync_requirement_fields(
    *,
    requirement,
    field_payloads,
    actor=None,
    confirm_data_loss=False,
):
    if not requirement.is_template:
        raise ValueError("产品需求的列来自模板，不能在这里编辑字段。")

    existing_fields = {
        field.id: field
        for field in RequirementField.objects.filter(requirement=requirement).select_related(
            "parent_field"
        )
    }
    submitted_ids = set()
    created_field_ids = {}
    data_loss_fields = []
    reset_select_fields = {}

    def save_field(payload, parent=None, index=0):
        field_id = payload.get("id")
        if field_id:
            field = existing_fields.get(field_id)
            if field is None:
                raise ValueError("A submitted field does not belong to this requirement.")
            expected_parent_id = parent.id if parent else None
            if field.parent_field_id != expected_parent_id:
                raise ValueError("Existing fields cannot be moved between field levels.")
            # 内置字段（标题/描述）是每个模板的硬性组成，只允许改名称与说明
            if field.builtin_key:
                if field.field_type != payload["field_type"]:
                    raise RequirementBuiltinFieldError("内置字段不能修改类型。")
                if not payload["is_active"]:
                    raise RequirementBuiltinFieldError("内置字段不能停用。")
            if (payload.get("builtin_key") or None) != (field.builtin_key or None):
                raise RequirementBuiltinFieldError("内置字段标识不可修改。")
            if field.field_type != payload["field_type"]:
                data_loss_fields.append(deepcopy(field))
            elif select_config_removes_values(field, payload):
                reset_select_fields[field.id] = (
                    deepcopy(field),
                    [] if get_requirement_select_mode(payload) == "multiple" else None,
                )
            submitted_ids.add(field.id)
        else:
            if payload.get("builtin_key"):
                raise RequirementBuiltinFieldError("内置字段由系统创建，不能手动新增。")
            field = RequirementField(requirement=requirement, parent_field=parent)

        field.name = payload["name"]
        field.field_type = payload["field_type"]
        field.is_required = payload["is_required"]
        field.is_active = payload["is_active"]
        field.sort_order = (index + 1) * SORT_ORDER_STEP
        field.config = deepcopy(payload.get("config") or {})
        field.default_value = deepcopy(payload.get("default_value"))
        field.full_clean(exclude=["created_by", "updated_by"])
        if field._state.adding and actor is not None:
            field.created_by = actor
        field.save()

        client_id = payload.get("client_id")
        if client_id:
            created_field_ids[str(client_id)] = str(field.id)

        for child_index, child_payload in enumerate(payload.get("children") or []):
            save_field(child_payload, parent=field, index=child_index)
        return field

    for root_index, root_payload in enumerate(field_payloads):
        save_field(root_payload, index=root_index)

    deleted_fields = [
        field for field_id, field in existing_fields.items() if field_id not in submitted_ids
    ]
    if any(field.builtin_key for field in deleted_fields):
        raise RequirementBuiltinFieldError("内置字段不能删除。")

    cleanup_fields_by_id = {
        field.id: field for field in [*deleted_fields, *data_loss_fields]
    }
    cleanup_fields = list(cleanup_fields_by_id.values())

    changed_by_model = []
    total_changed = 0
    if cleanup_fields or reset_select_fields:
        for model, queryset in details_affected_by_fields(requirement):
            changed = apply_field_change_cleanup(
                # of=("self",) 只锁明细行本身 —— 这些 queryset 都要 join 到需求或
                # 标准库，不该把那些行一起锁住。
                details=queryset.select_for_update(of=("self",)),
                removed_fields=cleanup_fields,
                reset_select_fields=list(reset_select_fields.values()),
                actor=actor,
            )
            changed_by_model.append((model, changed))
            total_changed += len(changed)

    if total_changed and not confirm_data_loss:
        raise RequirementDataLossError(total_changed)

    if deleted_fields:
        RequirementField.objects.filter(
            id__in=[field.id for field in deleted_fields]
        ).delete()
    for model, changed in changed_by_model:
        if changed:
            model.objects.bulk_update(
                changed, ["data", "version", "updated_at", "updated_by"]
            )

    requirement.updated_by = actor
    requirement.save(update_fields=["updated_at", "updated_by"])
    return created_field_ids


def insert_detail_row(
    *,
    model,
    scope,
    new_row,
    data,
    template_id,
    actor=None,
    before_id=None,
    after_id=None,
):
    """在指定位置插入一行明细并重排整列 sort_order。

    model / scope / new_row 三个参数让正式明细表与草稿明细表共用同一套插入与
    重排语义。
    """
    if before_id and after_id:
        raise ValueError("Only one insertion anchor can be provided.")

    existing = list(
        model.objects.select_for_update()
        .filter(**scope)
        .order_by("sort_order", "created_at", "id")
    )
    ids = [detail.id for detail in existing]
    if before_id:
        try:
            insert_at = ids.index(before_id)
        except ValueError as exc:
            raise ValueError("The insertion anchor was not found.") from exc
    elif after_id:
        try:
            insert_at = ids.index(after_id) + 1
        except ValueError as exc:
            raise ValueError("The insertion anchor was not found.") from exc
    else:
        insert_at = len(existing)

    detail = new_row(
        data=deepcopy(data),
        sort_order=(insert_at + 1) * SORT_ORDER_STEP,
        actor=actor,
        template_id=template_id,
    )
    detail.save()
    existing.insert(insert_at, detail)
    for index, item in enumerate(existing):
        item.sort_order = (index + 1) * SORT_ORDER_STEP
        item.updated_at = timezone.now()
    model.objects.bulk_update(existing, ["sort_order", "updated_at"])
    return detail


def _new_requirement_detail(requirement):
    def factory(data, sort_order, actor, template_id):
        return RequirementDetail(
            requirement=requirement,
            template_id=template_id,
            data=data,
            sort_order=sort_order,
            created_by=actor,
        )

    return factory


def _new_library_item(library):
    def factory(data, sort_order, actor, template_id):
        # 库内条目的模板恒等于库所选的模板，不接受调用方指定
        return RequirementDetail(
            library=library,
            template_id=library.template_id,
            data=data,
            sort_order=sort_order,
            created_by=actor,
        )

    return factory


def insert_requirement_detail(
    *,
    requirement,
    data,
    template_id,
    actor=None,
    before_id=None,
    after_id=None,
):
    return insert_detail_row(
        model=RequirementDetail,
        scope={"requirement": requirement},
        new_row=_new_requirement_detail(requirement),
        data=data,
        template_id=template_id,
        actor=actor,
        before_id=before_id,
        after_id=after_id,
    )


def insert_library_item(
    *,
    library,
    data,
    template_id=None,
    actor=None,
    before_id=None,
    after_id=None,
):
    return insert_detail_row(
        model=RequirementDetail,
        scope={"library": library},
        new_row=_new_library_item(library),
        data=data,
        template_id=library.template_id,
        actor=actor,
        before_id=before_id,
        after_id=after_id,
    )


def save_detail_row_batch(
    *,
    model,
    scope,
    new_row,
    creates,
    updates,
    deletes,
    actor=None,
    hard_delete=False,
):
    """批量保存明细的新增/修改/删除，并保持 sort_order 连续。

    正式明细表与草稿明细表共用这份实现，因此两条路径的响应形状完全一致，前端
    的明细网格无需为草稿态做任何分支。

    hard_delete 供草稿层使用：草稿行的 UUID 会在物化时复用为正式表主键，也会
    在重新「编辑」时被再次克隆，所以软删除留下的行会撞上 id 的唯一约束。
    """
    existing = list(
        model.objects.select_for_update()
        .filter(**scope)
        .order_by("sort_order", "created_at", "id")
    )
    details_by_id = {detail.id: detail for detail in existing}
    conflicts = []

    for item in [*updates, *deletes]:
        detail = details_by_id.get(item["id"])
        if detail is None:
            conflicts.append(
                {
                    "id": str(item["id"]),
                    "reason": "not_found",
                }
            )
        elif detail.version != item["version"]:
            conflicts.append(
                {
                    "id": str(item["id"]),
                    "reason": "version_conflict",
                    "current_version": detail.version,
                }
            )

    delete_ids = {item["id"] for item in deletes}
    for item in creates:
        anchor_id = item.get("before_id") or item.get("after_id")
        if anchor_id is None:
            continue
        if anchor_id in delete_ids:
            conflicts.append(
                {
                    "id": str(anchor_id),
                    "reason": "anchor_deleted",
                }
            )
        elif anchor_id not in details_by_id:
            conflicts.append(
                {
                    "id": str(anchor_id),
                    "reason": "anchor_not_found",
                }
            )

    if conflicts:
        raise RequirementDetailBatchConflict(conflicts)

    now = timezone.now()
    updated_details = []
    for item in updates:
        detail = details_by_id[item["id"]]
        detail.data = deepcopy(item["data"])
        detail.version += 1
        detail.updated_at = now
        detail.updated_by = actor
        updated_details.append(detail)
    if updated_details:
        model.objects.bulk_update(
            updated_details,
            ["data", "version", "updated_at", "updated_by"],
        )

    ordered_details = [
        detail for detail in existing if detail.id not in delete_ids
    ]
    created_details = []
    after_anchor_offsets = {}
    for item in creates:
        before_id = item.get("before_id")
        after_id = item.get("after_id")
        ordered_ids = [detail.id for detail in ordered_details]
        if before_id:
            insert_at = ordered_ids.index(before_id)
        elif after_id:
            anchor_offset = after_anchor_offsets.get(after_id, 0)
            insert_at = ordered_ids.index(after_id) + 1 + anchor_offset
            after_anchor_offsets[after_id] = anchor_offset + 1
        else:
            insert_at = len(ordered_details)

        detail = new_row(
            data=deepcopy(item["data"]),
            sort_order=(insert_at + 1) * SORT_ORDER_STEP,
            actor=actor,
            template_id=item.get("template_id"),
        )
        detail.save()
        ordered_details.insert(insert_at, detail)
        created_details.append((item["client_id"], detail))

    if delete_ids:
        doomed = model.objects.filter(**scope, id__in=delete_ids)
        if hard_delete:
            doomed.delete(soft=False)
        else:
            doomed.delete()

    if creates or deletes:
        for index, detail in enumerate(ordered_details):
            detail.sort_order = (index + 1) * SORT_ORDER_STEP
            detail.updated_at = now
        model.objects.bulk_update(
            ordered_details,
            ["sort_order", "updated_at"],
        )

    return created_details, updated_details, list(delete_ids)


def save_requirement_detail_batch(
    *,
    requirement,
    creates,
    updates,
    deletes,
    actor=None,
):
    return save_detail_row_batch(
        model=RequirementDetail,
        scope={"requirement": requirement},
        new_row=_new_requirement_detail(requirement),
        creates=creates,
        updates=updates,
        deletes=deletes,
        actor=actor,
    )


def build_library_import_creates(*, library, item_ids, before_id=None, after_id=None):
    """把选中的库条目整理成 save_detail_row_batch 认识的 creates 列表。

    data 原样深拷贝 —— 库条目与目标行引用的是同一个模板，字段 UUID 完全一致，
    不做任何重映射。只顺手裁掉不属于当前字段集的残留 key（字段后来被删过）。
    这里**不重跑必填校验**：库条目本来就允许留空，导入不该因此失败。
    """
    items_by_id = {
        item.id: item
        for item in RequirementDetail.objects.filter(
            library=library, id__in=item_ids
        ).order_by("sort_order", "created_at", "id")
    }
    missing = [item_id for item_id in item_ids if item_id not in items_by_id]
    if missing:
        raise ValueError("One or more library items were not found.")

    specs = get_library_field_specs(library)
    return [
        {
            "client_id": uuid4(),
            "data": prune_detail_data_to_fields(items_by_id[item_id].data, specs),
            "template_id": library.template_id,
            **({"before_id": before_id} if before_id else {}),
            **({"after_id": after_id} if after_id else {}),
        }
        for item_id in item_ids
    ]


def import_library_items(
    *, requirement, library, item_ids, actor=None, before_id=None, after_id=None
):
    """把标准库条目导入产品需求的正式明细表。"""
    return save_requirement_detail_batch(
        requirement=requirement,
        creates=build_library_import_creates(
            library=library,
            item_ids=item_ids,
            before_id=before_id,
            after_id=after_id,
        ),
        updates=[],
        deletes=[],
        actor=actor,
    )


def save_library_item_batch(
    *,
    library,
    creates,
    updates,
    deletes,
    actor=None,
):
    return save_detail_row_batch(
        model=RequirementDetail,
        scope={"library": library},
        new_row=_new_library_item(library),
        creates=creates,
        updates=updates,
        deletes=deletes,
        actor=actor,
    )


def prune_detail_data_to_fields(data, fields):
    """丢掉不属于这套字段的 key。

    只是安全网 —— 库条目可能残留着某个后来被删掉的字段的值。**不重跑必填校验**：
    标准库里的条目本来就允许留空，导入不该因为必填而失败。
    """
    roots = {
        str(field_attr(field, "id"))
        for field in fields
        if field_attr(field, "parent_field_id") is None
    }
    children_by_parent = {}
    for field in fields:
        parent_id = field_attr(field, "parent_field_id")
        if parent_id:
            children_by_parent.setdefault(str(parent_id), set()).add(
                str(field_attr(field, "id"))
            )

    pruned = {}
    for key, value in (data or {}).items():
        if key not in roots:
            continue
        allowed_children = children_by_parent.get(key)
        if allowed_children is not None and isinstance(value, list):
            rows = []
            for row in value:
                if not isinstance(row, dict):
                    continue
                values = row.get("values")
                rows.append(
                    {
                        "id": row.get("id"),
                        "values": {
                            child_id: child_value
                            for child_id, child_value in (values or {}).items()
                            if child_id in allowed_children
                        },
                    }
                )
            pruned[key] = rows
        else:
            pruned[key] = deepcopy(value)
    return pruned


def _is_empty_detail_value(value):
    if value is None:
        return True
    if isinstance(value, str):
        return not strip_tags(value).strip()
    if isinstance(value, (list, dict)):
        return not value
    return False


def _value_matches_filter(value, operator, expected, field=None):
    if operator == "is_empty":
        return _is_empty_detail_value(value)
    if operator == "is_not_empty":
        return not _is_empty_detail_value(value)
    if operator == "contains":
        if (
            field is not None
            and field_attr(field, "field_type") == RequirementFieldType.SELECT
            and get_requirement_select_mode(field) == "multiple"
        ):
            return isinstance(value, list) and expected in value
        return str(expected or "").casefold() in strip_tags(str(value or "")).casefold()
    if operator == "equals":
        if isinstance(value, str) and isinstance(expected, str):
            return value.casefold() == expected.casefold()
        return value == expected
    return False


def get_requirement_detail_field_values(detail_data, field):
    """取出某个字段在一行明细里的全部值（子表单字段可能有多行）。"""
    parent_field_id = field_attr(field, "parent_field_id")
    field_id = str(field_attr(field, "id"))
    if parent_field_id:
        rows = detail_data.get(str(parent_field_id), [])
        if not isinstance(rows, list):
            return []
        return [
            (row.get("values") or {}).get(field_id)
            for row in rows
            if isinstance(row, dict)
        ]
    return [detail_data.get(field_id)]


def filter_requirement_detail_ids(
    *, fields, details, search="", filters=None, fields_by_template=None
):
    """按搜索词与筛选条件筛出命中的明细行 ID。

    fields 是扁平并集，用来解析筛选条件里的 field_id；fields_by_template 给定时，
    每一行只用它自己模板的那套字段 —— 针对模板 B 某个字段的筛选不会误伤模板 A 的
    行（那些行根本没有这个字段，判定为不命中）。

    fields 接受任意字段来源（模型行 / spec / dict），details 接受任意明细序列，
    因此正式表与草稿表共用同一套搜索与筛选语义。
    """
    filters = filters or []
    fields = list(fields)
    details = list(details)
    fields_by_id = {str(field_attr(field, "id")): field for field in fields}

    def row_fields(detail):
        if fields_by_template is None:
            return fields
        return fields_by_template.get(str(detail.template_id), [])

    member_ids = set()
    for detail in details:
        for field in row_fields(detail):
            if field_attr(field, "field_type") != RequirementFieldType.MEMBER:
                continue
            for value in get_requirement_detail_field_values(detail.data, field):
                if value:
                    member_ids.add(value)
    members = {}
    for member in User.objects.filter(id__in=member_ids):
        members[str(member.id)] = member.display_name

    def get_field_values(detail, field):
        return get_requirement_detail_field_values(detail.data, field)

    def searchable_value(field, value):
        field_type = field_attr(field, "field_type")
        if field_type == RequirementFieldType.MEMBER:
            return members.get(str(value), str(value or ""))
        if field_type == RequirementFieldType.SELECT:
            option_labels = {
                str(option.get("id")): str(option.get("label") or "")
                for option in get_requirement_select_options(field)
                if isinstance(option, dict) and option.get("id")
            }
            selected_ids = value if isinstance(value, list) else [value]
            return " ".join(
                option_labels.get(str(option_id), "")
                for option_id in selected_ids
                if option_id
            )
        if field_type in (
            RequirementFieldType.ATTACHMENT,
            RequirementFieldType.IMAGE,
        ):
            if not isinstance(value, list):
                return ""
            return " ".join(
                str(item.get("name") or "")
                for item in value
                if isinstance(item, dict)
            )
        if field_type == RequirementFieldType.RICH_TEXT:
            return strip_tags(str(value or ""))
        return str(value or "")

    normalized_search = search.strip().casefold()
    matching_ids = []
    for detail in details:
        own_field_ids = {str(field_attr(field, "id")) for field in row_fields(detail)}
        if normalized_search:
            haystack = []
            for field in row_fields(detail):
                if field_attr(field, "field_type") == RequirementFieldType.FORM:
                    continue
                haystack.extend(
                    searchable_value(field, value)
                    for value in get_field_values(detail, field)
                )
            if normalized_search not in " ".join(haystack).casefold():
                continue

        matches = True
        for item in filters:
            field = fields_by_id.get(str(item.get("field_id")))
            if (
                field is None
                or field_attr(field, "field_type") == RequirementFieldType.FORM
                # 这一行的模板没有这个字段 —— 跨模板的筛选条件不命中它
                or str(field_attr(field, "id")) not in own_field_ids
            ):
                matches = False
                break
            values = get_field_values(detail, field)
            operator = item.get("operator")
            expected = item.get("value")
            if field_attr(field, "parent_field_id") and operator == "is_empty":
                item_matches = not values or all(
                    _value_matches_filter(value, operator, expected, field)
                    for value in values
                )
            else:
                item_matches = any(
                    _value_matches_filter(value, operator, expected, field)
                    for value in values
                )
            if not item_matches:
                matches = False
                break
        if matches:
            matching_ids.append(detail.id)
    return matching_ids
