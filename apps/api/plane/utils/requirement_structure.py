from __future__ import annotations

import hashlib
import json
import re
import uuid
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone

from plane.db.models import (
    RequirementFieldTemplate,
    RequirementSequenceCounter,
    RequirementStructuredFieldType,
    RequirementStructuredRevision,
    RequirementStructuredRow,
)


SORT_STEP = Decimal("1024")
ID_PREFIX_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,15}$")


class RequirementStructureError(Exception):
    def __init__(self, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


def _uuid(value: Any, field_name: str) -> uuid.UUID:
    try:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError) as exc:
        raise RequirementStructureError("STRUCTURED_FIELD_KEY_INVALID", f"{field_name} 必须是有效 UUID") from exc


def _is_empty(value: Any) -> bool:
    if value is None or (isinstance(value, str) and not value.strip()) or value in ([], {}):
        return True
    if isinstance(value, dict):
        return all(_is_empty(item) for item in value.values())
    return False


def _hash_payload(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Schema (field definitions) - stored as JSON list of API-shaped dicts
# ---------------------------------------------------------------------------


def validate_schema_payload(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(fields, list):
        raise RequirementStructureError("STRUCTURED_SCHEMA_INVALID", "fields 必须是数组")

    valid_types = {choice for choice, _label in RequirementStructuredFieldType.choices}
    normalized: list[dict[str, Any]] = []
    by_key: dict[uuid.UUID, dict[str, Any]] = {}
    for index, raw in enumerate(fields):
        if not isinstance(raw, dict):
            raise RequirementStructureError("STRUCTURED_SCHEMA_INVALID", "字段定义必须是对象")
        field_key = _uuid(raw.get("key") or raw.get("field_key") or uuid.uuid4(), "字段 key")
        if field_key in by_key:
            raise RequirementStructureError("STRUCTURED_FIELD_KEY_DUPLICATE", "字段 key 不能重复")
        name = str(raw.get("name") or "").strip()
        if not name:
            raise RequirementStructureError("STRUCTURED_FIELD_NAME_REQUIRED", "字段名称不能为空")
        if len(name) > 255:
            raise RequirementStructureError("STRUCTURED_FIELD_NAME_TOO_LONG", "字段名称不能超过 255 个字符")
        field_type = str(raw.get("field_type") or "")
        if field_type not in valid_types:
            raise RequirementStructureError("STRUCTURED_FIELD_TYPE_INVALID", f"不支持字段类型：{field_type}")
        parent_key = raw.get("parent_key") or raw.get("parent_field_key")
        parent_key = _uuid(parent_key, "父字段 key") if parent_key else None
        item = {
            "field_key": field_key,
            "parent_key": parent_key,
            "name": name,
            "description": str(raw.get("description") or ""),
            "field_type": field_type,
            "is_required": bool(raw.get("is_required", False)),
            "is_active": bool(raw.get("is_active", True)),
            "config": raw.get("config") if isinstance(raw.get("config"), dict) else {},
            "validation": raw.get("validation") if isinstance(raw.get("validation"), dict) else {},
            "options": raw.get("options") if isinstance(raw.get("options"), dict) else {},
            "default_value": raw.get("default_value"),
            "input_index": index,
        }
        by_key[field_key] = item
        normalized.append(item)

    sibling_names: set[tuple[uuid.UUID | None, str]] = set()
    auto_ids: dict[uuid.UUID | None, int] = defaultdict(int)
    for item in normalized:
        parent_key = item["parent_key"]
        parent = by_key.get(parent_key) if parent_key else None
        if parent_key and parent is None:
            raise RequirementStructureError("STRUCTURED_FIELD_PARENT_INVALID", "父字段不存在")
        if parent and parent["field_type"] != RequirementStructuredFieldType.TABLE:
            raise RequirementStructureError("STRUCTURED_FIELD_PARENT_NOT_TABLE", "只有子表字段可以包含子字段")
        if parent and item["field_type"] == RequirementStructuredFieldType.TABLE:
            raise RequirementStructureError("STRUCTURED_TABLE_DEPTH_EXCEEDED", "子表内不能继续定义子表")
        sibling_key = (parent_key, item["name"].casefold())
        if item["is_active"] and sibling_key in sibling_names:
            raise RequirementStructureError("STRUCTURED_FIELD_NAME_DUPLICATE", "同一层级字段名称不能重复")
        sibling_names.add(sibling_key)
        if item["field_type"] == RequirementStructuredFieldType.AUTO_ID and item["is_active"]:
            auto_ids[parent_key] += 1
            prefix = str(item["config"].get("prefix") or "").strip()
            if not ID_PREFIX_PATTERN.fullmatch(prefix):
                raise RequirementStructureError(
                    "STRUCTURED_AUTO_ID_PREFIX_INVALID",
                    "自动编号前缀必须以字母开头，且只能包含字母、数字和下划线（最多 16 位）",
                )
            padding = item["config"].get("padding", 0)
            if not isinstance(padding, int) or padding < 0 or padding > 12:
                raise RequirementStructureError("STRUCTURED_AUTO_ID_PADDING_INVALID", "编号补零位数必须在 0 到 12 之间")
            item["is_required"] = True
            item["default_value"] = None
        if item["field_type"] == RequirementStructuredFieldType.TABLE:
            item["default_value"] = None
        if item["field_type"] == RequirementStructuredFieldType.SELECT:
            _validate_select_options(item)
        _validate_field_rules(item)

    if any(count > 1 for count in auto_ids.values()):
        raise RequirementStructureError("STRUCTURED_AUTO_ID_DUPLICATE", "每个主记录或子表最多只能定义一个自动编号字段")
    root_auto_id = auto_ids.get(None, 0) == 1
    for parent_key, count in auto_ids.items():
        if parent_key is not None and count and not root_auto_id:
            raise RequirementStructureError("STRUCTURED_CHILD_AUTO_ID_REQUIRES_ROOT", "子表自动编号需要顶级自动编号字段")

    positions: dict[uuid.UUID | None, int] = defaultdict(int)
    for item in normalized:
        positions[item["parent_key"]] += 1
        item["sort_key"] = SORT_STEP * positions[item["parent_key"]]
    return normalized


def _validate_select_options(field: dict[str, Any]) -> None:
    selection_mode = field["config"].get("selection_mode", "single")
    if selection_mode not in {"single", "multiple"}:
        raise RequirementStructureError("STRUCTURED_SELECT_MODE_INVALID", "选择字段模式只能是 single 或 multiple")
    raw_options = field["options"].get("options", [])
    if not isinstance(raw_options, list):
        raise RequirementStructureError("STRUCTURED_SELECT_OPTIONS_INVALID", "选择项必须是数组")
    keys: set[str] = set()
    for option in raw_options:
        if not isinstance(option, dict):
            raise RequirementStructureError("STRUCTURED_SELECT_OPTIONS_INVALID", "选择项必须包含 key 和 label")
        key = str(option.get("key") or "").strip()
        label = str(option.get("label") or "").strip()
        if not key or not label or key in keys:
            raise RequirementStructureError("STRUCTURED_SELECT_OPTIONS_INVALID", "选择项 key/label 必填且 key 不能重复")
        keys.add(key)


def _validate_field_rules(field: dict[str, Any]) -> None:
    validation = field["validation"]
    field_type = field["field_type"]
    if field_type == RequirementStructuredFieldType.TEXT:
        minimum = validation.get("min_length")
        maximum = validation.get("max_length")
        try:
            minimum = int(minimum) if minimum not in (None, "") else None
            maximum = int(maximum) if maximum not in (None, "") else None
        except (TypeError, ValueError) as exc:
            raise RequirementStructureError("STRUCTURED_FIELD_VALIDATION_INVALID", "文本长度必须是整数") from exc
        if (minimum is not None and minimum < 0) or (maximum is not None and maximum < 0):
            raise RequirementStructureError("STRUCTURED_FIELD_VALIDATION_INVALID", "文本长度不能小于 0")
        if minimum is not None and maximum is not None and minimum > maximum:
            raise RequirementStructureError("STRUCTURED_FIELD_VALIDATION_INVALID", "文本最小长度不能大于最大长度")
    elif field_type in {RequirementStructuredFieldType.NUMBER, RequirementStructuredFieldType.NUMBER_RANGE}:
        minimum = validation.get("min")
        maximum = validation.get("max")
        try:
            minimum = Decimal(str(minimum)) if minimum not in (None, "") else None
            maximum = Decimal(str(maximum)) if maximum not in (None, "") else None
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise RequirementStructureError("STRUCTURED_FIELD_VALIDATION_INVALID", "数值上下限格式无效") from exc
        if minimum is not None and maximum is not None and minimum > maximum:
            raise RequirementStructureError("STRUCTURED_FIELD_VALIDATION_INVALID", "数值下限不能大于上限")
        unit = str(field["config"].get("unit") or "")
        if len(unit) > 32:
            raise RequirementStructureError("STRUCTURED_FIELD_VALIDATION_INVALID", "数值单位不能超过 32 个字符")
    elif field_type == RequirementStructuredFieldType.TABLE:
        minimum = validation.get("min_rows")
        maximum = validation.get("max_rows")
        try:
            minimum = int(minimum) if minimum not in (None, "") else None
            maximum = int(maximum) if maximum not in (None, "") else None
        except (TypeError, ValueError) as exc:
            raise RequirementStructureError("STRUCTURED_FIELD_VALIDATION_INVALID", "子表行数约束必须是整数") from exc
        if (minimum is not None and minimum < 0) or (maximum is not None and maximum < 0):
            raise RequirementStructureError("STRUCTURED_FIELD_VALIDATION_INVALID", "子表行数不能小于 0")
        if minimum is not None and maximum is not None and minimum > maximum:
            raise RequirementStructureError("STRUCTURED_FIELD_VALIDATION_INVALID", "子表最少行数不能大于最多行数")


def _stored_field(item: dict[str, Any]) -> dict[str, Any]:
    """Convert a validated schema item into the persisted (API-shaped) dict."""
    return {
        "key": str(item["field_key"]),
        "parent_key": str(item["parent_key"]) if item["parent_key"] else None,
        "name": item["name"],
        "description": item["description"],
        "field_type": item["field_type"],
        "sort_key": str(item["sort_key"]),
        "is_required": item["is_required"],
        "is_active": item["is_active"],
        "config": item["config"],
        "validation": item["validation"],
        "options": item["options"],
        "default_value": item["default_value"],
    }


def _schema_of(revision_or_template) -> list[dict[str, Any]]:
    return list(revision_or_template.schema or [])


def _active_fields(schema: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [field for field in schema if field.get("is_active", True)]


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


@transaction.atomic
def create_requirement_template(product, data: dict[str, Any], actor):
    normalized = validate_schema_payload(data.get("fields", []))
    template = RequirementFieldTemplate.objects.create(
        product=product,
        name=data["name"],
        description=data.get("description", ""),
        template_type=data.get("template_type", RequirementFieldTemplate.TemplateType.STRUCTURED),
        is_active=data.get("is_active", True),
        schema=[_stored_field(item) for item in normalized],
        created_by=actor,
    )
    return template


@transaction.atomic
def update_requirement_template(
    template: RequirementFieldTemplate,
    data: dict[str, Any],
    actor,
    expected_revision: int,
    *,
    replace_fields: bool,
):
    template = RequirementFieldTemplate.objects.select_for_update().get(pk=template.pk)
    if template.revision != expected_revision:
        raise RequirementStructureError("REQUIREMENT_TEMPLATE_STALE", "模板已被其他用户修改，请刷新后重试")
    if "template_type" in data and data["template_type"] != template.template_type:
        raise RequirementStructureError("REQUIREMENT_TEMPLATE_TYPE_IMMUTABLE", "模板类型创建后不能修改")
    update_fields = ["name", "description", "is_active", "revision", "updated_by", "updated_at"]
    if replace_fields:
        normalized = validate_schema_payload(data.get("fields", []))
        template.schema = [_stored_field(item) for item in normalized]
        update_fields.append("schema")
    for attribute in ("name", "description", "is_active"):
        if attribute in data:
            setattr(template, attribute, data[attribute])
    template.revision += 1
    template.updated_by = actor
    template.save(update_fields=update_fields)
    return template


def replace_template_schema(template: RequirementFieldTemplate, fields: list[dict[str, Any]], actor, expected_revision: int):
    return update_requirement_template(
        template,
        {"fields": fields},
        actor,
        expected_revision,
        replace_fields=True,
    )


# ---------------------------------------------------------------------------
# Revisions - schema + row cloning
# ---------------------------------------------------------------------------


@transaction.atomic
def create_structured_revision(change, actor, template: RequirementFieldTemplate | None = None, source_revision=None):
    revision = RequirementStructuredRevision.objects.create(
        requirement=change.requirement,
        change=change,
        source_revision=source_revision,
        source_template=template,
        source_template_revision=template.revision if template else None,
        schema=[],
        created_by=actor,
    )
    if source_revision:
        _clone_revision_content(source_revision, revision, actor)
    elif template:
        revision.schema = list(template.schema or [])
        revision.save(update_fields=["schema", "updated_at"])
    refresh_revision_metadata(revision)
    return revision


def _clone_revision_content(source, target, actor):
    target.schema = list(source.schema or [])
    target.save(update_fields=["schema", "updated_at"])

    source_rows = list(
        source.rows.filter(deleted_at__isnull=True).select_related("parent_row").order_by("sort_key", "created_at")
    )
    row_map: dict[Any, RequirementStructuredRow] = {}
    for row in [item for item in source_rows if item.parent_row_id is None]:
        row_map[row.id] = RequirementStructuredRow.objects.create(
            revision=target,
            row_key=row.row_key,
            sequence_number=row.sequence_number,
            display_id=row.display_id,
            sort_key=row.sort_key,
            values=row.values or {},
            created_by=actor,
        )
    for row in [item for item in source_rows if item.parent_row_id is not None]:
        row_map[row.id] = RequirementStructuredRow.objects.create(
            revision=target,
            row_key=row.row_key,
            parent_row=row_map[row.parent_row_id],
            table_field_key=row.table_field_key,
            sequence_number=row.sequence_number,
            display_id=row.display_id,
            sort_key=row.sort_key,
            values=row.values or {},
            created_by=actor,
        )


@transaction.atomic
def replace_revision_schema(revision, fields, actor, expected_lock_version):
    revision = _lock_editable_revision(revision.id, actor, expected_lock_version)
    normalized = validate_schema_payload(fields)
    existing_by_key = {field["key"]: field for field in _schema_of(revision)}
    counters = {
        str(field_key)
        for field_key in RequirementSequenceCounter.objects.filter(requirement=revision.requirement).values_list(
            "field_key", flat=True
        )
    }
    new_schema: list[dict[str, Any]] = []
    touched: set[str] = set()
    for item in normalized:
        key = str(item["field_key"])
        old = existing_by_key.get(key)
        if old is not None:
            _guard_field_mutation(revision, old, item, counters)
        new_schema.append(_stored_field(item))
        touched.add(key)
    for key, old in existing_by_key.items():
        if key in touched:
            continue
        if old["field_type"] == RequirementStructuredFieldType.AUTO_ID and key in counters:
            raise RequirementStructureError("STRUCTURED_AUTO_ID_IMMUTABLE", "已经产生编号的自动编号字段不能移除")
        new_schema.append({**old, "is_active": False})

    old_keys = set(existing_by_key)
    revision.schema = new_schema
    revision.updated_by = actor
    revision.save(update_fields=["schema", "updated_by", "updated_at"])
    _backfill_new_auto_ids(revision, old_keys, new_schema, actor)
    _bump_revision(revision, actor)
    refresh_revision_metadata(revision)
    return revision


def _guard_field_mutation(revision, old, item, counters):
    key = old["key"]
    new_parent = str(item["parent_key"]) if item["parent_key"] else None
    old_parent = old.get("parent_key")
    if old["field_type"] != item["field_type"] or old_parent != new_parent:
        if revision.rows.filter(values__has_key=key).exists():
            raise RequirementStructureError("STRUCTURED_FIELD_TYPE_IMMUTABLE", "已有数据的字段不能修改类型或层级")
    if old["field_type"] == RequirementStructuredFieldType.AUTO_ID and key in counters:
        if old.get("config") != item["config"] or not item["is_active"]:
            raise RequirementStructureError("STRUCTURED_AUTO_ID_IMMUTABLE", "已经产生编号的自动编号规则不能修改或停用")


def _backfill_new_auto_ids(revision, old_field_keys, new_schema, actor):
    new_auto_fields = [
        field
        for field in new_schema
        if field["field_type"] == RequirementStructuredFieldType.AUTO_ID and field["key"] not in old_field_keys
    ]
    for field in new_auto_fields:
        field_key = _uuid(field["key"], "字段 key")
        if not field["parent_key"]:
            rows = revision.rows.filter(parent_row__isnull=True).order_by("sort_key", "created_at", "id")
            for row in rows:
                number = _next_sequence(revision.requirement_id, field_key, None, actor)
                row.sequence_number = number
                row.display_id = _format_display_id(field, number, None)
                row.updated_by = actor
                row.save(update_fields=["sequence_number", "display_id", "updated_by", "updated_at"])
        else:
            parent_key = _uuid(field["parent_key"], "父字段 key")
            rows = (
                revision.rows.filter(table_field_key=parent_key)
                .select_related("parent_row")
                .order_by("parent_row_id", "sort_key", "created_at", "id")
            )
            for row in rows:
                number = _next_sequence(
                    revision.requirement_id,
                    field_key,
                    row.parent_row.row_key if row.parent_row_id else None,
                    actor,
                )
                row.sequence_number = number
                row.display_id = _format_display_id(
                    field, number, row.parent_row.display_id if row.parent_row_id else None
                )
                row.updated_by = actor
                row.save(update_fields=["sequence_number", "display_id", "updated_by", "updated_at"])


def _lock_editable_revision(revision_id, actor, expected_lock_version=None):
    revision = (
        RequirementStructuredRevision.objects.select_for_update()
        .select_related("change", "requirement", "requirement__product")
        .get(pk=revision_id)
    )
    if revision.status != RequirementStructuredRevision.Status.DRAFT or revision.change.status != "draft":
        raise RequirementStructureError("STRUCTURED_REVISION_READ_ONLY", "只有草稿结构化修订可以编辑")
    if expected_lock_version is not None and revision.lock_version != int(expected_lock_version):
        raise RequirementStructureError("STRUCTURED_REVISION_STALE", "结构化数据已被其他用户修改，请刷新后重试")
    from plane.utils.requirement import can_edit_requirement_draft

    if not can_edit_requirement_draft(revision.change, actor):
        raise RequirementStructureError("REQUIREMENT_DRAFT_EDIT_FORBIDDEN", "你没有编辑该草稿的权限")
    return revision


def _bump_revision(revision, actor):
    revision.lock_version += 1
    revision.updated_by = actor
    revision.save(update_fields=["lock_version", "updated_by", "updated_at"])


# ---------------------------------------------------------------------------
# Rows
# ---------------------------------------------------------------------------


def _scope_queryset(revision, parent_row=None, table_field_key=None):
    queryset = revision.rows.filter(deleted_at__isnull=True)
    if parent_row is None:
        return queryset.filter(parent_row__isnull=True, table_field_key__isnull=True)
    return queryset.filter(parent_row=parent_row, table_field_key=table_field_key)


def _position_sort_key(queryset, before_row=None, after_row=None):
    def rebalance():
        rows = list(queryset.order_by("sort_key", "created_at", "id"))
        for index, item in enumerate(rows, start=1):
            item.sort_key = SORT_STEP * index
        RequirementStructuredRow.objects.bulk_update(rows, ["sort_key"], batch_size=500)
        return {item.id: item for item in rows}

    if before_row and after_row:
        low, high = after_row.sort_key, before_row.sort_key
        if low >= high:
            raise RequirementStructureError("STRUCTURED_ROW_POSITION_INVALID", "插入位置无效")
        if high - low <= Decimal("0.000001"):
            rows = rebalance()
            before_row = rows[before_row.id]
            after_row = rows[after_row.id]
            low, high = after_row.sort_key, before_row.sort_key
        return (low + high) / 2
    if before_row:
        previous = queryset.filter(sort_key__lt=before_row.sort_key).order_by("-sort_key").first()
        if previous and before_row.sort_key - previous.sort_key <= Decimal("0.000001"):
            rows = rebalance()
            before_row = rows[before_row.id]
            previous = queryset.filter(sort_key__lt=before_row.sort_key).order_by("-sort_key").first()
        return (previous.sort_key + before_row.sort_key) / 2 if previous else before_row.sort_key - SORT_STEP
    if after_row:
        following = queryset.filter(sort_key__gt=after_row.sort_key).order_by("sort_key").first()
        if following and following.sort_key - after_row.sort_key <= Decimal("0.000001"):
            rows = rebalance()
            after_row = rows[after_row.id]
            following = queryset.filter(sort_key__gt=after_row.sort_key).order_by("sort_key").first()
        return (after_row.sort_key + following.sort_key) / 2 if following else after_row.sort_key + SORT_STEP
    maximum = queryset.aggregate(value=Max("sort_key"))["value"]
    return (maximum or Decimal("0")) + SORT_STEP


def _find_auto_id_field(schema, table_field_key=None):
    scope_key = str(table_field_key) if table_field_key else None
    for field in schema:
        if field["field_type"] != RequirementStructuredFieldType.AUTO_ID or not field.get("is_active", True):
            continue
        if field.get("parent_key") == scope_key:
            return field
    return None


def _next_sequence(requirement_id, field_key, parent_row_key, actor):
    lookup = {
        "requirement_id": requirement_id,
        "field_key": field_key,
        "parent_row_key": parent_row_key,
    }
    try:
        # Keep a savepoint around the create race. Without it, an IntegrityError
        # would mark the caller's whole row transaction as broken.
        with transaction.atomic():
            counter, _created = RequirementSequenceCounter.objects.get_or_create(
                **lookup,
                defaults={"next_number": 1, "created_by": actor},
            )
    except IntegrityError:
        counter = RequirementSequenceCounter.objects.get(**lookup)
    counter = RequirementSequenceCounter.objects.select_for_update().get(pk=counter.pk)
    number = counter.next_number
    counter.next_number = number + 1
    counter.updated_by = actor
    counter.save(update_fields=["next_number", "updated_by", "updated_at"])
    return number


def _format_display_id(field, number, parent_display_id=None):
    prefix = str(field["config"].get("prefix") or "")
    padding = int(field["config"].get("padding") or 0)
    local = f"{prefix}{str(number).zfill(padding)}"
    return f"{parent_display_id}-{local}" if parent_display_id else local


@transaction.atomic
def create_structured_row(
    revision,
    actor,
    values=None,
    parent_row_key=None,
    table_field_key=None,
    before_row_key=None,
    after_row_key=None,
    expected_lock_version=None,
):
    revision = _lock_editable_revision(revision.id, actor, expected_lock_version)
    schema = _schema_of(revision)
    parent_row = None
    table_field = None
    if parent_row_key or table_field_key:
        if not parent_row_key or not table_field_key:
            raise RequirementStructureError("STRUCTURED_CHILD_SCOPE_INVALID", "子表行必须同时指定父记录和子表字段")
        parent_row = revision.rows.filter(row_key=parent_row_key, parent_row__isnull=True).first()
        table_field = next(
            (
                field
                for field in schema
                if field["key"] == str(table_field_key)
                and not field.get("parent_key")
                and field["field_type"] == RequirementStructuredFieldType.TABLE
                and field.get("is_active", True)
            ),
            None,
        )
        if parent_row is None or table_field is None:
            raise RequirementStructureError("STRUCTURED_CHILD_SCOPE_INVALID", "父记录或子表字段不存在")
    scope_field_key = _uuid(table_field_key, "子表字段 key") if table_field else None
    queryset = _scope_queryset(revision, parent_row, scope_field_key)
    before_row = queryset.filter(row_key=before_row_key).first() if before_row_key else None
    after_row = queryset.filter(row_key=after_row_key).first() if after_row_key else None
    if before_row_key and before_row is None or after_row_key and after_row is None:
        raise RequirementStructureError("STRUCTURED_ROW_POSITION_INVALID", "排序锚点不在当前数据范围")
    sort_key = _position_sort_key(queryset, before_row, after_row)
    auto_field = _find_auto_id_field(schema, scope_field_key)
    number = None
    display_id = None
    if auto_field:
        number = _next_sequence(
            revision.requirement_id,
            _uuid(auto_field["key"], "字段 key"),
            parent_row.row_key if parent_row else None,
            actor,
        )
        display_id = _format_display_id(auto_field, number, parent_row.display_id if parent_row else None)
    row = RequirementStructuredRow.objects.create(
        revision=revision,
        parent_row=parent_row,
        table_field_key=scope_field_key,
        sequence_number=number,
        display_id=display_id,
        sort_key=sort_key,
        values={},
        created_by=actor,
    )
    if values:
        _save_row_values(revision, row, values, actor)
    _bump_revision(revision, actor)
    refresh_revision_metadata(revision)
    return row, revision


@transaction.atomic
def update_structured_row(revision, row_key, actor, values, expected_lock_version=None):
    revision = _lock_editable_revision(revision.id, actor, expected_lock_version)
    row = revision.rows.select_for_update().filter(row_key=row_key).first()
    if row is None:
        raise RequirementStructureError("STRUCTURED_ROW_NOT_FOUND", "数据行不存在")
    _save_row_values(revision, row, values or {}, actor)
    _bump_revision(revision, actor)
    refresh_revision_metadata(revision)
    return row, revision


def _save_row_values(revision, row, values, actor):
    if not isinstance(values, dict):
        raise RequirementStructureError("STRUCTURED_VALUES_INVALID", "values 必须是字段 key 到值的对象")
    active_by_key = {field["key"]: field for field in _active_fields(_schema_of(revision))}
    provided = {str(key) for key in values}
    if not provided.issubset(set(active_by_key)):
        raise RequirementStructureError("STRUCTURED_VALUE_FIELD_INVALID", "存在不属于当前字段方案的字段")
    row_table_field_key = str(row.table_field_key) if row.table_field_key else None
    merged = dict(row.values or {})
    for raw_key, raw_value in values.items():
        field = active_by_key[str(raw_key)]
        if field["field_type"] in {RequirementStructuredFieldType.TABLE, RequirementStructuredFieldType.AUTO_ID}:
            raise RequirementStructureError("STRUCTURED_VALUE_READ_ONLY", "子表和自动编号字段不能直接填写")
        if row.parent_row_id is None and field.get("parent_key"):
            raise RequirementStructureError("STRUCTURED_VALUE_SCOPE_INVALID", "主记录不能填写子表子字段")
        if row.parent_row_id is not None and field.get("parent_key") != row_table_field_key:
            raise RequirementStructureError("STRUCTURED_VALUE_SCOPE_INVALID", "字段不属于当前子表")
        merged[str(raw_key)] = _normalize_value(field, raw_value)
    row.values = merged
    row.updated_by = actor
    row.save(update_fields=["values", "updated_by", "updated_at"])


def _normalize_value(field, value):
    if _is_empty(value):
        return None
    field_type = field["field_type"]
    if field_type == RequirementStructuredFieldType.TEXT:
        text_value = str(value)
        min_length = field["validation"].get("min_length")
        max_length = field["validation"].get("max_length")
        if min_length is not None and len(text_value) < int(min_length):
            raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field['name']} 长度不能小于 {min_length}")
        if max_length is not None and len(text_value) > int(max_length):
            raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field['name']} 长度不能超过 {max_length}")
        return text_value
    if field_type == RequirementStructuredFieldType.NUMBER:
        number = _decimal(value, field["name"])
        _validate_number_bounds(field, number)
        return _decimal_to_str(number)
    if field_type == RequirementStructuredFieldType.NUMBER_RANGE:
        if not isinstance(value, dict):
            raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field['name']} 必须包含 min 和 max")
        minimum = _decimal(value.get("min"), field["name"])
        maximum = _decimal(value.get("max"), field["name"])
        if minimum > maximum:
            raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field['name']} 最小值不能大于最大值")
        _validate_number_bounds(field, minimum)
        _validate_number_bounds(field, maximum)
        return {"min": _decimal_to_str(minimum), "max": _decimal_to_str(maximum)}
    if field_type == RequirementStructuredFieldType.BOOLEAN:
        if not isinstance(value, bool):
            raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field['name']} 必须是布尔值")
        return value
    if field_type == RequirementStructuredFieldType.DATE:
        try:
            parsed = value if isinstance(value, date) else datetime.strptime(str(value), "%Y-%m-%d").date()
        except (TypeError, ValueError) as exc:
            raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field['name']} 日期格式必须是 YYYY-MM-DD") from exc
        return parsed.isoformat()
    if field_type == RequirementStructuredFieldType.SELECT:
        options = field["options"].get("options", [])
        allowed = {str(item.get("key")) for item in options if item.get("is_active", True)}
        multiple = field["config"].get("selection_mode", "single") == "multiple"
        if multiple:
            if not isinstance(value, list):
                raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field['name']} 必须是数组")
            normalized = list(dict.fromkeys(str(item) for item in value))
            if any(item not in allowed for item in normalized):
                raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field['name']} 存在无效选项")
            return normalized
        normalized = str(value)
        if normalized not in allowed:
            raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field['name']} 存在无效选项")
        return normalized
    return None


def _decimal(value, field_name):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field_name} 必须是有效数值") from exc


def _decimal_to_str(value: Decimal | None) -> str | None:
    """去掉 DecimalField 固定小数位带来的末尾 0，例如 11.5000000000 → 11.5。"""
    if value is None:
        return None
    text = format(value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def _validate_number_bounds(field, number):
    minimum = field["validation"].get("min")
    maximum = field["validation"].get("max")
    if minimum is not None and number < Decimal(str(minimum)):
        raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field['name']} 不能小于 {minimum}")
    if maximum is not None and number > Decimal(str(maximum)):
        raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field['name']} 不能大于 {maximum}")


@transaction.atomic
def delete_structured_row(revision, row_key, actor, expected_lock_version=None):
    revision = _lock_editable_revision(revision.id, actor, expected_lock_version)
    row = revision.rows.select_for_update().filter(row_key=row_key).first()
    if row is None:
        raise RequirementStructureError("STRUCTURED_ROW_NOT_FOUND", "数据行不存在")
    now = timezone.now()
    row.child_rows.update(deleted_at=now, updated_by=actor)
    row.deleted_at = now
    row.updated_by = actor
    row.save(update_fields=["deleted_at", "updated_by", "updated_at"])
    _bump_revision(revision, actor)
    refresh_revision_metadata(revision)
    return revision


@transaction.atomic
def reorder_structured_row(
    revision,
    row_key,
    actor,
    before_row_key=None,
    after_row_key=None,
    expected_lock_version=None,
):
    revision = _lock_editable_revision(revision.id, actor, expected_lock_version)
    row = revision.rows.select_for_update().select_related("parent_row").filter(row_key=row_key).first()
    if row is None:
        raise RequirementStructureError("STRUCTURED_ROW_NOT_FOUND", "数据行不存在")
    queryset = _scope_queryset(revision, row.parent_row, row.table_field_key).exclude(pk=row.pk)
    before = queryset.filter(row_key=before_row_key).first() if before_row_key else None
    after = queryset.filter(row_key=after_row_key).first() if after_row_key else None
    if before_row_key and before is None or after_row_key and after is None:
        raise RequirementStructureError("STRUCTURED_ROW_POSITION_INVALID", "排序锚点不在当前数据范围")
    row.sort_key = _position_sort_key(queryset, before, after)
    row.updated_by = actor
    row.save(update_fields=["sort_key", "updated_by", "updated_at"])
    _bump_revision(revision, actor)
    refresh_revision_metadata(revision)
    return row, revision


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------


def serialize_structured_row(row):
    return {
        "key": str(row.row_key),
        "parent_row_key": str(row.parent_row.row_key) if row.parent_row_id else None,
        "table_field_key": str(row.table_field_key) if row.table_field_key else None,
        "display_id": row.display_id,
        "sequence_number": row.sequence_number,
        "sort_key": str(row.sort_key),
        "values": row.values or {},
    }


# ---------------------------------------------------------------------------
# Submission validation + metadata
# ---------------------------------------------------------------------------


def validate_revision_for_submission(revision):
    schema = _active_fields(_schema_of(revision))
    if not schema:
        raise RequirementStructureError("STRUCTURED_SCHEMA_REQUIRED", "结构化需求至少需要一个字段")
    root_rows = list(revision.rows.filter(deleted_at__isnull=True, parent_row__isnull=True))
    if not root_rows:
        raise RequirementStructureError("STRUCTURED_ROWS_REQUIRED", "结构化需求至少需要一条主记录")
    root_fields = [field for field in schema if not field.get("parent_key")]
    table_fields = [field for field in root_fields if field["field_type"] == RequirementStructuredFieldType.TABLE]
    for row in root_rows:
        row_values = row.values or {}
        for field in root_fields:
            if field["field_type"] == RequirementStructuredFieldType.AUTO_ID and not row.display_id:
                raise RequirementStructureError("STRUCTURED_AUTO_ID_MISSING", f"记录缺少 {field['name']}")
            if field["field_type"] not in {
                RequirementStructuredFieldType.TABLE,
                RequirementStructuredFieldType.AUTO_ID,
            }:
                value = row_values.get(field["key"])
                if field["is_required"] and _is_empty(value):
                    raise RequirementStructureError(
                        "STRUCTURED_REQUIRED_VALUE_MISSING",
                        f"{row.display_id or row.row_key} 的 {field['name']} 为必填字段",
                    )
                if not _is_empty(value):
                    _normalize_value(field, value)
        for table_field in table_fields:
            child_rows = list(
                revision.rows.filter(
                    deleted_at__isnull=True,
                    parent_row=row,
                    table_field_key=_uuid(table_field["key"], "字段 key"),
                )
            )
            minimum = int(table_field["validation"].get("min_rows", 1 if table_field["is_required"] else 0))
            maximum = table_field["validation"].get("max_rows")
            if len(child_rows) < minimum:
                raise RequirementStructureError(
                    "STRUCTURED_TABLE_ROWS_MISSING",
                    f"{row.display_id or row.row_key} 的 {table_field['name']} 至少需要 {minimum} 行",
                )
            if maximum is not None and len(child_rows) > int(maximum):
                raise RequirementStructureError(
                    "STRUCTURED_TABLE_ROWS_EXCEEDED",
                    f"{row.display_id or row.row_key} 的 {table_field['name']} 不能超过 {maximum} 行",
                )
            child_fields = [field for field in schema if field.get("parent_key") == table_field["key"]]
            for child in child_rows:
                child_values = child.values or {}
                for field in child_fields:
                    if field["field_type"] == RequirementStructuredFieldType.AUTO_ID and not child.display_id:
                        raise RequirementStructureError("STRUCTURED_AUTO_ID_MISSING", f"子表记录缺少 {field['name']}")
                    if field["field_type"] != RequirementStructuredFieldType.AUTO_ID:
                        value = child_values.get(field["key"])
                        if field["is_required"] and _is_empty(value):
                            raise RequirementStructureError(
                                "STRUCTURED_REQUIRED_VALUE_MISSING",
                                f"{child.display_id or child.row_key} 的 {field['name']} 为必填字段",
                            )
                        if not _is_empty(value):
                            _normalize_value(field, value)


def refresh_revision_metadata(revision):
    schema = _schema_of(revision)
    rows = list(_live_rows(revision).order_by("sort_key", "created_at", "id"))
    revision.root_row_count = sum(1 for row in rows if row.parent_row_id is None)
    revision.child_row_count = len(rows) - revision.root_row_count
    revision.schema_hash = _hash_payload(schema)
    revision.content_hash = _hash_payload([serialize_structured_row(row) for row in rows])
    revision.save(
        update_fields=["root_row_count", "child_row_count", "schema_hash", "content_hash", "updated_at"]
    )


@transaction.atomic
def lock_revision_for_review(revision, actor):
    revision = RequirementStructuredRevision.objects.select_for_update().get(pk=revision.pk)
    validate_revision_for_submission(revision)
    refresh_revision_metadata(revision)
    _store_structured_diff_summary(revision.change, revision.source_revision, revision)
    revision.status = RequirementStructuredRevision.Status.LOCKED
    revision.locked_at = timezone.now()
    revision.updated_by = actor
    revision.save(update_fields=["status", "locked_at", "updated_by", "updated_at"])
    return revision


# ---------------------------------------------------------------------------
# Diff - computed on demand from before/after revisions
# ---------------------------------------------------------------------------


def _ordered_predecessors(items, key_getter, group_getter, sort_getter):
    result = {}
    grouped = defaultdict(list)
    for item in items:
        grouped[group_getter(item)].append(item)
    for group_items in grouped.values():
        previous = None
        for item in sorted(group_items, key=sort_getter):
            result[key_getter(item)] = previous
            previous = key_getter(item)
    return result


def _field_snapshot(field):
    return {key: value for key, value in field.items() if key != "sort_key"}


def _row_snapshot(row):
    snapshot = serialize_structured_row(row)
    snapshot.pop("sort_key", None)
    return snapshot


_PREVIEW_FIELD_LIMIT = 3
_PREVIEW_VALUE_MAX_LEN = 24


def _format_preview_value(field, value):
    """把单个字段值渲染成给人看的短文本（与前端 formatFieldValue 保持一致的口径）。"""
    if _is_empty(value):
        return ""
    field_type = field.get("field_type")
    if field_type == RequirementStructuredFieldType.BOOLEAN:
        return "是" if value is True else "否" if value is False else ""
    if field_type == RequirementStructuredFieldType.SELECT:
        options = (field.get("options") or {}).get("options") or []
        labels = {str(option.get("key")): str(option.get("label") or option.get("key")) for option in options}
        if isinstance(value, list):
            return "、".join(labels.get(str(item), str(item)) for item in value)
        return labels.get(str(value), str(value))
    if field_type == RequirementStructuredFieldType.NUMBER_RANGE:
        if not isinstance(value, dict):
            return ""
        return f"{value.get('min') or '…'} ~ {value.get('max') or '…'}"
    return str(value)


def _row_preview_label(row, schema, scope):
    """为主记录/子表记录生成可读标题：优先自动编号，其次前几个字段的“名称 值”，都没有则回退占位。"""
    scope_key = str(row.table_field_key) if row.table_field_key else None
    fields = [
        field
        for field in schema
        if field.get("is_active", True)
        and field.get("field_type") not in {RequirementStructuredFieldType.TABLE, RequirementStructuredFieldType.AUTO_ID}
        and (field.get("parent_key") or None) == scope_key
    ]
    fields.sort(key=lambda field: Decimal(str(field.get("sort_key") or "0")))
    values = row.values or {}
    pairs = []
    for field in fields:
        text = _format_preview_value(field, values.get(field["key"]))
        if not text:
            continue
        if len(text) > _PREVIEW_VALUE_MAX_LEN:
            text = text[:_PREVIEW_VALUE_MAX_LEN] + "…"
        pairs.append(f"{field['name']} {text}")
        if len(pairs) >= _PREVIEW_FIELD_LIMIT:
            break
    preview = " · ".join(pairs)
    if row.display_id and preview:
        return f"{row.display_id} · {preview}"
    if row.display_id:
        return row.display_id
    if preview:
        return preview
    return "未命名子表记录" if scope == "child_row" else "未命名主记录"


def _schema_change_type(before, after):
    """字段方案变更类型：停用（is_active→False）视为删除，重新启用视为新增。"""
    if before is None:
        return "added"
    if after is None:
        return "removed"
    before_active = before.get("is_active", True)
    after_active = after.get("is_active", True)
    if before_active and not after_active:
        return "removed"
    if not before_active and after_active:
        return "added"
    return "modified"


def _live_rows(revision):
    """关联 manager 走 base manager，不会自动排除软删行，这里显式过滤。"""
    return revision.rows.filter(deleted_at__isnull=True).select_related("parent_row")


def compute_structured_diff(before_revision, after_revision):
    """Compute the structured diff between two revisions as a list of API-shaped dicts."""
    entries: list[dict[str, Any]] = []
    before_fields = {field["key"]: field for field in _schema_of(before_revision)} if before_revision else {}
    after_fields = {field["key"]: field for field in _schema_of(after_revision)}

    for key in sorted(set(before_fields) | set(after_fields)):
        before = before_fields.get(key)
        after = after_fields.get(key)
        # 已停用字段之间的细枝末节差异对评审无意义，跳过
        if before and after and not before.get("is_active", True) and not after.get("is_active", True):
            continue
        before_value = _field_snapshot(before) if before else None
        after_value = _field_snapshot(after) if after else None
        if before_value == after_value:
            continue
        change_type = _schema_change_type(before, after)
        entries.append(
            {
                "scope": "schema",
                "change_type": change_type,
                "field_key": key,
                "row_key": None,
                "parent_row_key": None,
                "label": (after or before)["name"],
                "before_value": before_value,
                "after_value": after_value if change_type != "removed" else None,
                "sort_key": str((after or before).get("sort_key") or "0"),
            }
        )

    # 移动只关心两侧都仍启用的字段
    common_field_keys = {
        key
        for key in set(before_fields) & set(after_fields)
        if before_fields[key].get("is_active", True) and after_fields[key].get("is_active", True)
    }
    before_field_predecessors = _ordered_predecessors(
        [field for key, field in before_fields.items() if key in common_field_keys],
        lambda field: field["key"],
        lambda field: field.get("parent_key"),
        lambda field: (Decimal(str(field.get("sort_key") or "0")), field["key"]),
    )
    after_field_predecessors = _ordered_predecessors(
        [field for key, field in after_fields.items() if key in common_field_keys],
        lambda field: field["key"],
        lambda field: field.get("parent_key"),
        lambda field: (Decimal(str(field.get("sort_key") or "0")), field["key"]),
    )
    for key in sorted(common_field_keys):
        if before_field_predecessors.get(key) == after_field_predecessors.get(key):
            continue
        field = after_fields[key]
        entries.append(
            {
                "scope": "schema",
                "change_type": "moved",
                "field_key": key,
                "row_key": None,
                "parent_row_key": None,
                "label": field["name"],
                "before_value": {"after_field_key": before_field_predecessors.get(key)},
                "after_value": {"after_field_key": after_field_predecessors.get(key)},
                "sort_key": str(field.get("sort_key") or "0"),
            }
        )

    before_schema = _schema_of(before_revision) if before_revision else []
    after_schema = _schema_of(after_revision) if after_revision else []
    before_rows = {row.row_key: row for row in _live_rows(before_revision)} if before_revision else {}
    after_rows = {row.row_key: row for row in _live_rows(after_revision)}
    common_row_keys = set(before_rows) & set(after_rows)
    before_predecessors = _ordered_predecessors(
        [row for key, row in before_rows.items() if key in common_row_keys],
        lambda row: row.row_key,
        lambda row: (row.parent_row.row_key if row.parent_row_id else None, row.table_field_key),
        lambda row: (row.sort_key, row.created_at, row.id),
    )
    after_predecessors = _ordered_predecessors(
        [row for key, row in after_rows.items() if key in common_row_keys],
        lambda row: row.row_key,
        lambda row: (row.parent_row.row_key if row.parent_row_id else None, row.table_field_key),
        lambda row: (row.sort_key, row.created_at, row.id),
    )
    for key in sorted(set(before_rows) | set(after_rows), key=str):
        before = before_rows.get(key)
        after = after_rows.get(key)
        before_value = _row_snapshot(before) if before else None
        after_value = _row_snapshot(after) if after else None
        scope_row = after or before
        scope = "child_row" if scope_row.parent_row_id else "root_row"
        parent_key = str(scope_row.parent_row.row_key) if scope_row.parent_row_id else None
        row_label = _row_preview_label(scope_row, after_schema if after is not None else before_schema, scope)
        if before is None or after is None or before_value != after_value:
            entries.append(
                {
                    "scope": scope,
                    "change_type": ("added" if before is None else "removed" if after is None else "modified"),
                    "field_key": None,
                    "row_key": str(key),
                    "parent_row_key": parent_key,
                    "label": row_label,
                    "before_value": before_value,
                    "after_value": after_value,
                    "sort_key": str(scope_row.sort_key),
                }
            )
        if before and after and before_predecessors.get(key) != after_predecessors.get(key):
            before_predecessor = before_predecessors.get(key)
            after_predecessor = after_predecessors.get(key)
            entries.append(
                {
                    "scope": scope,
                    "change_type": "moved",
                    "field_key": None,
                    "row_key": str(key),
                    "parent_row_key": parent_key,
                    "label": row_label,
                    "before_value": {"after_row_key": str(before_predecessor) if before_predecessor else None},
                    "after_value": {"after_row_key": str(after_predecessor) if after_predecessor else None},
                    "sort_key": str(scope_row.sort_key),
                }
            )

    entries.sort(key=lambda entry: (Decimal(str(entry.get("sort_key") or "0")), str(entry.get("row_key") or entry.get("field_key") or "")))
    return entries


def summarize_structured_diff(entries):
    summary = defaultdict(int)
    for entry in entries:
        summary[f"{entry['scope']}_{entry['change_type']}"] += 1
    return dict(summary)


def _store_structured_diff_summary(change, before_revision, after_revision):
    entries = compute_structured_diff(before_revision, after_revision)
    change.structured_diff_summary = summarize_structured_diff(entries)
    change.save(update_fields=["structured_diff_summary", "updated_at"])
    return entries
