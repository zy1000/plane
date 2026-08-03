from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Optional
from uuid import uuid4

from django.utils import timezone
from django.utils.html import strip_tags

from plane.app.permissions import ROLE
from plane.db.models import (
    Product,
    ProductMember,
    ProjectMember,
    RequirementApprover,
    RequirementDetail,
    RequirementField,
    RequirementFieldType,
    User,
    Workspace,
    WorkspaceMember,
)


SORT_ORDER_STEP = 1000


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
    """字段定义的统一形状，桥接「正式表的 DB 行」与「草稿快照里的 JSON 树」。

    id / parent_field_id 一律是字符串，让明细 data 里以字段 ID 为 key 的结构在
    两条路径上走同一套索引逻辑。
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
        )
        for field in fields
    ]


def field_specs_from_tree(tree, *, parent_id=None):
    """把 serialize_requirement_field_tree 形状的嵌套树摊平成 spec 列表。"""
    specs = []
    for index, node in enumerate(tree or []):
        node_id = str(node.get("id") or uuid4())
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
            )
        )
        if node.get("children"):
            specs.extend(field_specs_from_tree(node["children"], parent_id=node_id))
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
    """字段变更会波及的明细行。

    模板字段被标准库实时引用，所以改模板字段要连带清理引用它的全部库内条目。
    """
    if requirement.is_template:
        return RequirementDetail.objects.filter(library__template=requirement)
    return RequirementDetail.objects.filter(requirement=requirement)


def clone_requirement_children(*, source, target, actor=None):
    """Clone a template's field tree onto the target requirement."""
    source_fields = list(source.fields.all())
    field_map = {}

    root_fields = []
    for source_field in source_fields:
        if source_field.parent_field_id:
            continue
        cloned_field = RequirementField(
            requirement=target,
            name=source_field.name,
            field_type=source_field.field_type,
            is_required=source_field.is_required,
            is_active=source_field.is_active,
            sort_order=source_field.sort_order,
            config=deepcopy(source_field.config),
            default_value=deepcopy(source_field.default_value),
            created_by=actor,
        )
        root_fields.append(cloned_field)
        field_map[source_field.id] = cloned_field

    if root_fields:
        RequirementField.objects.bulk_create(root_fields)

    child_fields = []
    for source_field in source_fields:
        if not source_field.parent_field_id:
            continue
        cloned_parent = field_map.get(source_field.parent_field_id)
        if cloned_parent is None:
            raise ValueError("The requirement template contains an invalid field tree.")
        cloned_field = RequirementField(
            requirement=target,
            parent_field=cloned_parent,
            name=source_field.name,
            field_type=source_field.field_type,
            is_required=source_field.is_required,
            is_active=source_field.is_active,
            sort_order=source_field.sort_order,
            config=deepcopy(source_field.config),
            default_value=deepcopy(source_field.default_value),
            created_by=actor,
        )
        child_fields.append(cloned_field)
        field_map[source_field.id] = cloned_field

    if child_fields:
        RequirementField.objects.bulk_create(child_fields)


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


def get_requirement_field_specs(requirement):
    return _field_specs_of(requirement)


def serialize_requirement_field_tree(requirement):
    return field_tree_from_specs(get_requirement_field_specs(requirement))


def get_library_field_specs(library):
    """标准库的字段实时引用所选模板，不拷贝。"""
    return _field_specs_of(library.template)


def serialize_library_field_tree(library):
    return field_tree_from_specs(get_library_field_specs(library))


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
            if field.field_type != payload["field_type"]:
                data_loss_fields.append(deepcopy(field))
            elif select_config_removes_values(field, payload):
                reset_select_fields[field.id] = (
                    deepcopy(field),
                    [] if get_requirement_select_mode(payload) == "multiple" else None,
                )
            submitted_ids.add(field.id)
        else:
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
    cleanup_fields_by_id = {
        field.id: field for field in [*deleted_fields, *data_loss_fields]
    }
    cleanup_fields = list(cleanup_fields_by_id.values())

    changed_details = []
    if cleanup_fields or reset_select_fields:
        changed_details = apply_field_change_cleanup(
            # of=("self",) 只锁明细行本身 —— 模板路径要 join 到标准库，不该把模板
            # 与标准库的行一起锁住。
            details=details_affected_by_fields(requirement).select_for_update(
                of=("self",)
            ),
            removed_fields=cleanup_fields,
            reset_select_fields=list(reset_select_fields.values()),
            actor=actor,
        )

    if changed_details and not confirm_data_loss:
        raise RequirementDataLossError(len(changed_details))

    if deleted_fields:
        RequirementField.objects.filter(
            id__in=[field.id for field in deleted_fields]
        ).delete()
    if changed_details:
        RequirementDetail.objects.bulk_update(
            changed_details, ["data", "version", "updated_at", "updated_by"]
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
    )
    detail.save()
    existing.insert(insert_at, detail)
    for index, item in enumerate(existing):
        item.sort_order = (index + 1) * SORT_ORDER_STEP
        item.updated_at = timezone.now()
    model.objects.bulk_update(existing, ["sort_order", "updated_at"])
    return detail


def insert_requirement_detail(
    *,
    requirement,
    data,
    actor=None,
    before_id=None,
    after_id=None,
):
    return insert_detail_row(
        model=RequirementDetail,
        scope={"requirement": requirement},
        new_row=lambda data, sort_order, actor: RequirementDetail(
            requirement=requirement,
            data=data,
            sort_order=sort_order,
            created_by=actor,
        ),
        data=data,
        actor=actor,
        before_id=before_id,
        after_id=after_id,
    )


def insert_library_item(
    *,
    library,
    data,
    actor=None,
    before_id=None,
    after_id=None,
):
    return insert_detail_row(
        model=RequirementDetail,
        scope={"library": library},
        new_row=lambda data, sort_order, actor: RequirementDetail(
            library=library,
            data=data,
            sort_order=sort_order,
            created_by=actor,
        ),
        data=data,
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
        new_row=lambda data, sort_order, actor: RequirementDetail(
            requirement=requirement,
            data=data,
            sort_order=sort_order,
            created_by=actor,
        ),
        creates=creates,
        updates=updates,
        deletes=deletes,
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
        new_row=lambda data, sort_order, actor: RequirementDetail(
            library=library,
            data=data,
            sort_order=sort_order,
            created_by=actor,
        ),
        creates=creates,
        updates=updates,
        deletes=deletes,
        actor=actor,
    )


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


def filter_requirement_detail_ids(*, fields, details, search="", filters=None):
    """按搜索词与筛选条件筛出命中的明细行 ID。

    fields 接受任意字段来源（模型行 / spec / dict），details 接受任意明细序列，
    因此正式表与草稿表共用同一套搜索与筛选语义。
    """
    filters = filters or []
    fields = list(fields)
    details = list(details)
    fields_by_id = {str(field_attr(field, "id")): field for field in fields}

    member_ids = set()
    for detail in details:
        for field in fields:
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
        if normalized_search:
            haystack = []
            for field in fields:
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
