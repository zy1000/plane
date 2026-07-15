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
    RequirementStructuredDiffEntry,
    RequirementStructuredField,
    RequirementStructuredFieldType,
    RequirementStructuredRevision,
    RequirementStructuredRow,
    RequirementStructuredValue,
    RequirementTemplateField,
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


def _json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _hash_payload(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


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


def serialize_template_field(field: RequirementTemplateField) -> dict[str, Any]:
    return {
        "key": str(field.field_key),
        "parent_key": str(field.parent_field.field_key) if field.parent_field_id else None,
        "name": field.name,
        "description": field.description,
        "field_type": field.field_type,
        "sort_key": str(field.sort_key),
        "is_required": field.is_required,
        "is_active": field.is_active,
        "config": field.config or {},
        "validation": field.validation or {},
        "options": field.options or {},
        "default_value": field.default_value,
    }


def serialize_structured_field(field: RequirementStructuredField) -> dict[str, Any]:
    return {
        "key": str(field.field_key),
        "parent_key": str(field.parent_field.field_key) if field.parent_field_id else None,
        "name": field.name,
        "description": field.description,
        "field_type": field.field_type,
        "sort_key": str(field.sort_key),
        "is_required": field.is_required,
        "is_active": field.is_active,
        "config": field.config or {},
        "validation": field.validation or {},
        "options": field.options or {},
        "default_value": field.default_value,
    }


def _write_template_fields(template, normalized, actor):
    existing = {item.field_key: item for item in template.fields.select_for_update().all()}
    parent_map: dict[uuid.UUID, RequirementTemplateField] = {}
    touched: set[uuid.UUID] = set()
    for parent_key in (None,):
        for item in [field for field in normalized if field["parent_key"] == parent_key]:
            model = _upsert_template_field(template, existing.get(item["field_key"]), item, None, actor)
            parent_map[item["field_key"]] = model
            touched.add(item["field_key"])
    for item in [field for field in normalized if field["parent_key"] is not None]:
        model = _upsert_template_field(
            template,
            existing.get(item["field_key"]),
            item,
            parent_map[item["parent_key"]],
            actor,
        )
        parent_map[item["field_key"]] = model
        touched.add(item["field_key"])
    for field_key, model in existing.items():
        if field_key not in touched:
            model.delete()


@transaction.atomic
def create_requirement_template(product, data: dict[str, Any], actor):
    normalized = validate_schema_payload(data.get("fields", []))
    template = RequirementFieldTemplate.objects.create(
        product=product,
        name=data["name"],
        description=data.get("description", ""),
        template_type=data.get("template_type", RequirementFieldTemplate.TemplateType.STRUCTURED),
        is_active=data.get("is_active", True),
        created_by=actor,
    )
    _write_template_fields(template, normalized, actor)
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
    if replace_fields:
        normalized = validate_schema_payload(data.get("fields", []))
        _write_template_fields(template, normalized, actor)
    for attribute in ("name", "description", "is_active"):
        if attribute in data:
            setattr(template, attribute, data[attribute])
    template.revision += 1
    template.updated_by = actor
    template.save(update_fields=["name", "description", "is_active", "revision", "updated_by", "updated_at"])
    return template


def replace_template_schema(template: RequirementFieldTemplate, fields: list[dict[str, Any]], actor, expected_revision: int):
    return update_requirement_template(
        template,
        {"fields": fields},
        actor,
        expected_revision,
        replace_fields=True,
    )


def _upsert_template_field(template, model, item, parent, actor):
    if model is None:
        return RequirementTemplateField.objects.create(
            template=template,
            field_key=item["field_key"],
            parent_field=parent,
            name=item["name"],
            description=item["description"],
            field_type=item["field_type"],
            sort_key=item["sort_key"],
            is_required=item["is_required"],
            is_active=item["is_active"],
            config=item["config"],
            validation=item["validation"],
            options=item["options"],
            default_value=item["default_value"],
            created_by=actor,
        )
    for key in [
        "name",
        "description",
        "field_type",
        "sort_key",
        "is_required",
        "is_active",
        "config",
        "validation",
        "options",
        "default_value",
    ]:
        setattr(model, key, item[key])
    model.parent_field = parent
    model.deleted_at = None
    model.updated_by = actor
    model.save()
    return model


@transaction.atomic
def create_structured_revision(change, actor, template: RequirementFieldTemplate | None = None, source_revision=None):
    revision = RequirementStructuredRevision.objects.create(
        requirement=change.requirement,
        change=change,
        source_revision=source_revision,
        source_template=template,
        source_template_revision=template.revision if template else None,
        created_by=actor,
    )
    if source_revision:
        _clone_revision_content(source_revision, revision, actor)
    elif template:
        _copy_template_schema(template, revision, actor)
    refresh_revision_metadata(revision)
    return revision


def _copy_template_schema(template, revision, actor):
    fields = list(template.fields.select_related("parent_field").order_by("sort_key", "created_at"))
    model_map = {}
    for field in [item for item in fields if item.parent_field_id is None]:
        model_map[field.id] = RequirementStructuredField.objects.create(
            revision=revision,
            field_key=field.field_key,
            name=field.name,
            description=field.description,
            field_type=field.field_type,
            sort_key=field.sort_key,
            is_required=field.is_required,
            is_active=field.is_active,
            config=field.config,
            validation=field.validation,
            options=field.options,
            default_value=field.default_value,
            created_by=actor,
        )
    for field in [item for item in fields if item.parent_field_id is not None]:
        model_map[field.id] = RequirementStructuredField.objects.create(
            revision=revision,
            field_key=field.field_key,
            parent_field=model_map[field.parent_field_id],
            name=field.name,
            description=field.description,
            field_type=field.field_type,
            sort_key=field.sort_key,
            is_required=field.is_required,
            is_active=field.is_active,
            config=field.config,
            validation=field.validation,
            options=field.options,
            default_value=field.default_value,
            created_by=actor,
        )


def _clone_revision_content(source, target, actor):
    source_fields = list(source.fields.select_related("parent_field").order_by("sort_key", "created_at"))
    field_map = {}
    for field in [item for item in source_fields if item.parent_field_id is None]:
        field_map[field.id] = RequirementStructuredField.objects.create(
            revision=target,
            field_key=field.field_key,
            name=field.name,
            description=field.description,
            field_type=field.field_type,
            sort_key=field.sort_key,
            is_required=field.is_required,
            is_active=field.is_active,
            config=field.config,
            validation=field.validation,
            options=field.options,
            default_value=field.default_value,
            created_by=actor,
        )
    for field in [item for item in source_fields if item.parent_field_id is not None]:
        field_map[field.id] = RequirementStructuredField.objects.create(
            revision=target,
            field_key=field.field_key,
            parent_field=field_map[field.parent_field_id],
            name=field.name,
            description=field.description,
            field_type=field.field_type,
            sort_key=field.sort_key,
            is_required=field.is_required,
            is_active=field.is_active,
            config=field.config,
            validation=field.validation,
            options=field.options,
            default_value=field.default_value,
            created_by=actor,
        )
    source_rows = list(source.rows.select_related("parent_row", "table_field").order_by("sort_key", "created_at"))
    row_map = {}
    for row in [item for item in source_rows if item.parent_row_id is None]:
        row_map[row.id] = RequirementStructuredRow.objects.create(
            revision=target,
            row_key=row.row_key,
            sequence_number=row.sequence_number,
            display_id=row.display_id,
            sort_key=row.sort_key,
            created_by=actor,
        )
    for row in [item for item in source_rows if item.parent_row_id is not None]:
        row_map[row.id] = RequirementStructuredRow.objects.create(
            revision=target,
            row_key=row.row_key,
            parent_row=row_map[row.parent_row_id],
            table_field=field_map[row.table_field_id],
            sequence_number=row.sequence_number,
            display_id=row.display_id,
            sort_key=row.sort_key,
            created_by=actor,
        )
    values = [
        RequirementStructuredValue(
            revision=target,
            row=row_map[value.row_id],
            field=field_map[value.field_id],
            value_text=value.value_text,
            value_number=value.value_number,
            value_boolean=value.value_boolean,
            value_date=value.value_date,
            value_min=value.value_min,
            value_max=value.value_max,
            value_json=value.value_json,
            created_by=actor,
        )
        for value in source.values.all()
    ]
    RequirementStructuredValue.objects.bulk_create(values, batch_size=500)


@transaction.atomic
def replace_revision_schema(revision, fields, actor, expected_lock_version):
    revision = _lock_editable_revision(revision.id, actor, expected_lock_version)
    normalized = validate_schema_payload(fields)
    existing = {item.field_key: item for item in revision.fields.select_for_update().all()}
    values_by_field = set(revision.values.values_list("field_id", flat=True))
    counters = set(
        RequirementSequenceCounter.objects.filter(requirement=revision.requirement).values_list("field_key", flat=True)
    )
    parent_map = {}
    touched = set()
    for item in [field for field in normalized if field["parent_key"] is None]:
        model = _upsert_revision_field(revision, existing.get(item["field_key"]), item, None, actor, values_by_field, counters)
        parent_map[item["field_key"]] = model
        touched.add(item["field_key"])
    for item in [field for field in normalized if field["parent_key"] is not None]:
        model = _upsert_revision_field(
            revision,
            existing.get(item["field_key"]),
            item,
            parent_map[item["parent_key"]],
            actor,
            values_by_field,
            counters,
        )
        parent_map[item["field_key"]] = model
        touched.add(item["field_key"])
    for field_key, model in existing.items():
        if field_key not in touched:
            if model.field_type == RequirementStructuredFieldType.AUTO_ID and field_key in counters:
                raise RequirementStructureError("STRUCTURED_AUTO_ID_IMMUTABLE", "已经产生编号的自动编号字段不能移除")
            model.is_active = False
            model.updated_by = actor
            model.save(update_fields=["is_active", "updated_by", "updated_at"])

    _backfill_new_auto_ids(revision, existing, parent_map, actor)
    _bump_revision(revision, actor)
    refresh_revision_metadata(revision)
    return revision


def _upsert_revision_field(revision, model, item, parent, actor, values_by_field, counters):
    if model is None:
        return RequirementStructuredField.objects.create(
            revision=revision,
            field_key=item["field_key"],
            parent_field=parent,
            name=item["name"],
            description=item["description"],
            field_type=item["field_type"],
            sort_key=item["sort_key"],
            is_required=item["is_required"],
            is_active=item["is_active"],
            config=item["config"],
            validation=item["validation"],
            options=item["options"],
            default_value=item["default_value"],
            created_by=actor,
        )
    if model.id in values_by_field and (model.field_type != item["field_type"] or model.parent_field_id != getattr(parent, "id", None)):
        raise RequirementStructureError("STRUCTURED_FIELD_TYPE_IMMUTABLE", "已有数据的字段不能修改类型或层级")
    if model.field_type == RequirementStructuredFieldType.AUTO_ID and model.field_key in counters:
        if model.config != item["config"] or not item["is_active"]:
            raise RequirementStructureError("STRUCTURED_AUTO_ID_IMMUTABLE", "已经产生编号的自动编号规则不能修改或停用")
    for key in [
        "name",
        "description",
        "field_type",
        "sort_key",
        "is_required",
        "is_active",
        "config",
        "validation",
        "options",
        "default_value",
    ]:
        setattr(model, key, item[key])
    model.parent_field = parent
    model.updated_by = actor
    model.save()
    return model


def _backfill_new_auto_ids(revision, old_fields, new_fields, actor):
    new_auto_fields = [
        field
        for key, field in new_fields.items()
        if field.field_type == RequirementStructuredFieldType.AUTO_ID and key not in old_fields
    ]
    for field in new_auto_fields:
        if field.parent_field_id is None:
            rows = revision.rows.filter(parent_row__isnull=True).order_by("sort_key", "created_at", "id")
        else:
            rows = revision.rows.filter(table_field=field.parent_field).select_related("parent_row").order_by(
                "parent_row_id", "sort_key", "created_at", "id"
            )
        for row in rows:
            number = _next_sequence(revision.requirement_id, field.field_key, row.parent_row.row_key if row.parent_row else None, actor)
            row.sequence_number = number
            row.display_id = _format_display_id(field, number, row.parent_row.display_id if row.parent_row else None)
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


def _scope_queryset(revision, parent_row=None, table_field=None):
    queryset = revision.rows.filter(deleted_at__isnull=True)
    if parent_row is None:
        return queryset.filter(parent_row__isnull=True, table_field__isnull=True)
    return queryset.filter(parent_row=parent_row, table_field=table_field)


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


def _find_auto_id_field(revision, table_field=None):
    queryset = revision.fields.filter(
        field_type=RequirementStructuredFieldType.AUTO_ID,
        is_active=True,
        deleted_at__isnull=True,
    )
    return queryset.filter(parent_field=table_field).first() if table_field else queryset.filter(parent_field__isnull=True).first()


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
    prefix = str(field.config.get("prefix") or "")
    padding = int(field.config.get("padding") or 0)
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
    parent_row = None
    table_field = None
    if parent_row_key or table_field_key:
        if not parent_row_key or not table_field_key:
            raise RequirementStructureError("STRUCTURED_CHILD_SCOPE_INVALID", "子表行必须同时指定父记录和子表字段")
        parent_row = revision.rows.filter(row_key=parent_row_key, parent_row__isnull=True).first()
        table_field = revision.fields.filter(
            field_key=table_field_key,
            parent_field__isnull=True,
            field_type=RequirementStructuredFieldType.TABLE,
            is_active=True,
        ).first()
        if parent_row is None or table_field is None:
            raise RequirementStructureError("STRUCTURED_CHILD_SCOPE_INVALID", "父记录或子表字段不存在")
    queryset = _scope_queryset(revision, parent_row, table_field)
    before_row = queryset.filter(row_key=before_row_key).first() if before_row_key else None
    after_row = queryset.filter(row_key=after_row_key).first() if after_row_key else None
    if before_row_key and before_row is None or after_row_key and after_row is None:
        raise RequirementStructureError("STRUCTURED_ROW_POSITION_INVALID", "排序锚点不在当前数据范围")
    sort_key = _position_sort_key(queryset, before_row, after_row)
    auto_field = _find_auto_id_field(revision, table_field)
    number = None
    display_id = None
    if auto_field:
        number = _next_sequence(
            revision.requirement_id,
            auto_field.field_key,
            parent_row.row_key if parent_row else None,
            actor,
        )
        display_id = _format_display_id(auto_field, number, parent_row.display_id if parent_row else None)
    row = RequirementStructuredRow.objects.create(
        revision=revision,
        parent_row=parent_row,
        table_field=table_field,
        sequence_number=number,
        display_id=display_id,
        sort_key=sort_key,
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
    # The revision content hash is based on row timestamps. Touch the row after
    # editing values so value-only changes are reflected in the frozen snapshot.
    row.updated_by = actor
    row.save(update_fields=["updated_by", "updated_at"])
    _bump_revision(revision, actor)
    refresh_revision_metadata(revision)
    return row, revision


def _save_row_values(revision, row, values, actor):
    if not isinstance(values, dict):
        raise RequirementStructureError("STRUCTURED_VALUES_INVALID", "values 必须是字段 key 到值的对象")
    fields = revision.fields.filter(
        field_key__in=list(values.keys()),
        is_active=True,
        deleted_at__isnull=True,
    )
    field_map = {str(field.field_key): field for field in fields}
    if set(field_map) != {str(key) for key in values}:
        raise RequirementStructureError("STRUCTURED_VALUE_FIELD_INVALID", "存在不属于当前字段方案的字段")
    for raw_key, raw_value in values.items():
        field = field_map[str(raw_key)]
        if field.field_type in {RequirementStructuredFieldType.TABLE, RequirementStructuredFieldType.AUTO_ID}:
            raise RequirementStructureError("STRUCTURED_VALUE_READ_ONLY", "子表和自动编号字段不能直接填写")
        if row.parent_row_id is None and field.parent_field_id is not None:
            raise RequirementStructureError("STRUCTURED_VALUE_SCOPE_INVALID", "主记录不能填写子表子字段")
        if row.parent_row_id is not None and field.parent_field_id != row.table_field_id:
            raise RequirementStructureError("STRUCTURED_VALUE_SCOPE_INVALID", "字段不属于当前子表")
        columns = _normalize_value(field, raw_value)
        value, _created = RequirementStructuredValue.objects.get_or_create(
            revision=revision,
            row=row,
            field=field,
            defaults={**columns, "created_by": actor},
        )
        if not _created:
            for name, column_value in columns.items():
                setattr(value, name, column_value)
            value.updated_by = actor
            value.deleted_at = None
            value.save()


def _normalize_value(field, value):
    columns = {
        "value_text": None,
        "value_number": None,
        "value_boolean": None,
        "value_date": None,
        "value_min": None,
        "value_max": None,
        "value_json": None,
    }
    if _is_empty(value):
        return columns
    if field.field_type == RequirementStructuredFieldType.TEXT:
        text_value = str(value)
        min_length = field.validation.get("min_length")
        max_length = field.validation.get("max_length")
        if min_length is not None and len(text_value) < int(min_length):
            raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field.name} 长度不能小于 {min_length}")
        if max_length is not None and len(text_value) > int(max_length):
            raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field.name} 长度不能超过 {max_length}")
        columns["value_text"] = text_value
        columns["value_json"] = text_value
    elif field.field_type == RequirementStructuredFieldType.NUMBER:
        number = _decimal(value, field.name)
        _validate_number_bounds(field, number)
        columns["value_number"] = number
        columns["value_json"] = str(number)
    elif field.field_type == RequirementStructuredFieldType.NUMBER_RANGE:
        if not isinstance(value, dict):
            raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field.name} 必须包含 min 和 max")
        minimum = _decimal(value.get("min"), field.name)
        maximum = _decimal(value.get("max"), field.name)
        if minimum > maximum:
            raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field.name} 最小值不能大于最大值")
        _validate_number_bounds(field, minimum)
        _validate_number_bounds(field, maximum)
        columns["value_min"] = minimum
        columns["value_max"] = maximum
        columns["value_json"] = {"min": str(minimum), "max": str(maximum)}
    elif field.field_type == RequirementStructuredFieldType.BOOLEAN:
        if not isinstance(value, bool):
            raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field.name} 必须是布尔值")
        columns["value_boolean"] = value
        columns["value_json"] = value
    elif field.field_type == RequirementStructuredFieldType.DATE:
        try:
            parsed = value if isinstance(value, date) else datetime.strptime(str(value), "%Y-%m-%d").date()
        except (TypeError, ValueError) as exc:
            raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field.name} 日期格式必须是 YYYY-MM-DD") from exc
        columns["value_date"] = parsed
        columns["value_json"] = parsed.isoformat()
    elif field.field_type == RequirementStructuredFieldType.SELECT:
        options = field.options.get("options", [])
        allowed = {str(item.get("key")) for item in options if item.get("is_active", True)}
        multiple = field.config.get("selection_mode", "single") == "multiple"
        if multiple:
            if not isinstance(value, list):
                raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field.name} 必须是数组")
            normalized = list(dict.fromkeys(str(item) for item in value))
            if any(item not in allowed for item in normalized):
                raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field.name} 存在无效选项")
            columns["value_json"] = normalized
        else:
            normalized = str(value)
            if normalized not in allowed:
                raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field.name} 存在无效选项")
            columns["value_text"] = normalized
            columns["value_json"] = normalized
    return columns


def _decimal(value, field_name):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field_name} 必须是有效数值") from exc


def _validate_number_bounds(field, number):
    minimum = field.validation.get("min")
    maximum = field.validation.get("max")
    if minimum is not None and number < Decimal(str(minimum)):
        raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field.name} 不能小于 {minimum}")
    if maximum is not None and number > Decimal(str(maximum)):
        raise RequirementStructureError("STRUCTURED_VALUE_INVALID", f"{field.name} 不能大于 {maximum}")


@transaction.atomic
def delete_structured_row(revision, row_key, actor, expected_lock_version=None):
    revision = _lock_editable_revision(revision.id, actor, expected_lock_version)
    row = revision.rows.select_for_update().filter(row_key=row_key).first()
    if row is None:
        raise RequirementStructureError("STRUCTURED_ROW_NOT_FOUND", "数据行不存在")
    now = timezone.now()
    child_ids = list(row.child_rows.values_list("id", flat=True))
    revision.values.filter(row_id__in=[row.id, *child_ids]).update(deleted_at=now, updated_by=actor)
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
    row = revision.rows.select_for_update().select_related("parent_row", "table_field").filter(row_key=row_key).first()
    if row is None:
        raise RequirementStructureError("STRUCTURED_ROW_NOT_FOUND", "数据行不存在")
    queryset = _scope_queryset(revision, row.parent_row, row.table_field).exclude(pk=row.pk)
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


def _value_for_response(value):
    if value.value_number is not None:
        return str(value.value_number)
    if value.value_min is not None or value.value_max is not None:
        return {"min": str(value.value_min), "max": str(value.value_max)}
    if value.value_date is not None:
        return value.value_date.isoformat()
    if value.value_boolean is not None:
        return value.value_boolean
    if value.value_text is not None:
        return value.value_text
    return value.value_json


def serialize_structured_row(row, fields_by_id=None):
    values = {}
    for value in row.values.all():
        values[str(value.field.field_key)] = _value_for_response(value)
    return {
        "key": str(row.row_key),
        "parent_row_key": str(row.parent_row.row_key) if row.parent_row_id else None,
        "table_field_key": str(row.table_field.field_key) if row.table_field_id else None,
        "display_id": row.display_id,
        "sequence_number": row.sequence_number,
        "sort_key": str(row.sort_key),
        "values": values,
    }


def validate_revision_for_submission(revision):
    fields = list(revision.fields.filter(is_active=True).select_related("parent_field"))
    if not fields:
        raise RequirementStructureError("STRUCTURED_SCHEMA_REQUIRED", "结构化需求至少需要一个字段")
    root_rows = list(revision.rows.filter(parent_row__isnull=True).prefetch_related("values"))
    if not root_rows:
        raise RequirementStructureError("STRUCTURED_ROWS_REQUIRED", "结构化需求至少需要一条主记录")
    value_maps = {
        row.id: {value.field_id: _value_for_response(value) for value in row.values.all()}
        for row in root_rows
    }
    root_fields = [field for field in fields if field.parent_field_id is None]
    table_fields = [field for field in root_fields if field.field_type == RequirementStructuredFieldType.TABLE]
    for row in root_rows:
        for field in root_fields:
            if field.field_type == RequirementStructuredFieldType.AUTO_ID and not row.display_id:
                raise RequirementStructureError("STRUCTURED_AUTO_ID_MISSING", f"记录缺少 {field.name}")
            if field.field_type not in {RequirementStructuredFieldType.TABLE, RequirementStructuredFieldType.AUTO_ID}:
                value = value_maps[row.id].get(field.id)
                if field.is_required and _is_empty(value):
                    raise RequirementStructureError(
                        "STRUCTURED_REQUIRED_VALUE_MISSING",
                        f"{row.display_id or row.row_key} 的 {field.name} 为必填字段",
                    )
                if not _is_empty(value):
                    _normalize_value(field, value)
        for table_field in table_fields:
            child_rows = list(
                revision.rows.filter(parent_row=row, table_field=table_field).prefetch_related("values")
            )
            minimum = int(table_field.validation.get("min_rows", 1 if table_field.is_required else 0))
            maximum = table_field.validation.get("max_rows")
            if len(child_rows) < minimum:
                raise RequirementStructureError(
                    "STRUCTURED_TABLE_ROWS_MISSING",
                    f"{row.display_id or row.row_key} 的 {table_field.name} 至少需要 {minimum} 行",
                )
            if maximum is not None and len(child_rows) > int(maximum):
                raise RequirementStructureError(
                    "STRUCTURED_TABLE_ROWS_EXCEEDED",
                    f"{row.display_id or row.row_key} 的 {table_field.name} 不能超过 {maximum} 行",
                )
            child_fields = [field for field in fields if field.parent_field_id == table_field.id]
            for child in child_rows:
                child_values = {value.field_id: _value_for_response(value) for value in child.values.all()}
                for field in child_fields:
                    if field.field_type == RequirementStructuredFieldType.AUTO_ID and not child.display_id:
                        raise RequirementStructureError("STRUCTURED_AUTO_ID_MISSING", f"子表记录缺少 {field.name}")
                    if field.field_type != RequirementStructuredFieldType.AUTO_ID:
                        value = child_values.get(field.id)
                        if field.is_required and _is_empty(value):
                            raise RequirementStructureError(
                                "STRUCTURED_REQUIRED_VALUE_MISSING",
                                f"{child.display_id or child.row_key} 的 {field.name} 为必填字段",
                            )
                        if not _is_empty(value):
                            _normalize_value(field, value)


def refresh_revision_metadata(revision):
    fields = [serialize_structured_field(field) for field in revision.fields.select_related("parent_field")]
    rows = list(revision.rows.select_related("parent_row", "table_field").prefetch_related("values__field"))
    revision.root_row_count = sum(1 for row in rows if row.parent_row_id is None)
    revision.child_row_count = len(rows) - revision.root_row_count
    revision.schema_hash = _hash_payload(fields)
    revision.content_hash = _hash_payload([serialize_structured_row(row) for row in rows])
    revision.save(
        update_fields=["root_row_count", "child_row_count", "schema_hash", "content_hash", "updated_at"]
    )


@transaction.atomic
def lock_revision_for_review(revision, actor):
    revision = RequirementStructuredRevision.objects.select_for_update().get(pk=revision.pk)
    validate_revision_for_submission(revision)
    refresh_revision_metadata(revision)
    build_structured_diff_entries(revision.change, revision.source_revision, revision, actor)
    revision.status = RequirementStructuredRevision.Status.LOCKED
    revision.locked_at = timezone.now()
    revision.updated_by = actor
    revision.save(update_fields=["status", "locked_at", "updated_by", "updated_at"])
    return revision


def _ordered_predecessors(items, key_getter, group_getter):
    result = {}
    grouped = defaultdict(list)
    for item in items:
        grouped[group_getter(item)].append(item)
    for group_items in grouped.values():
        previous = None
        for item in sorted(group_items, key=lambda value: (value.sort_key, value.created_at, value.id)):
            result[key_getter(item)] = previous
            previous = key_getter(item)
    return result


def _field_snapshot(field):
    snapshot = serialize_structured_field(field)
    snapshot.pop("sort_key", None)
    return snapshot


def _row_snapshot(row):
    snapshot = serialize_structured_row(row)
    snapshot.pop("sort_key", None)
    return snapshot


@transaction.atomic
def build_structured_diff_entries(change, before_revision, after_revision, actor):
    change.structured_diff_entries.all().delete()
    entries = []
    before_fields = {field.field_key: field for field in before_revision.fields.select_related("parent_field")} if before_revision else {}
    after_fields = {field.field_key: field for field in after_revision.fields.select_related("parent_field")}
    for key in sorted(set(before_fields) | set(after_fields), key=str):
        before = before_fields.get(key)
        after = after_fields.get(key)
        before_value = _field_snapshot(before) if before else None
        after_value = _field_snapshot(after) if after else None
        if before_value == after_value:
            continue
        entries.append(
            RequirementStructuredDiffEntry(
                change=change,
                scope=RequirementStructuredDiffEntry.Scope.SCHEMA,
                change_type=(
                    RequirementStructuredDiffEntry.ChangeType.ADDED
                    if before is None
                    else RequirementStructuredDiffEntry.ChangeType.REMOVED
                    if after is None
                    else RequirementStructuredDiffEntry.ChangeType.MODIFIED
                ),
                field_key=key,
                label=(after or before).name,
                before_value=before_value,
                after_value=after_value,
                sort_key=(after or before).sort_key,
                created_by=actor,
            )
        )

    common_field_keys = set(before_fields) & set(after_fields)
    before_field_predecessors = _ordered_predecessors(
        [field for key, field in before_fields.items() if key in common_field_keys],
        lambda field: field.field_key,
        lambda field: field.parent_field.field_key if field.parent_field_id else None,
    )
    after_field_predecessors = _ordered_predecessors(
        [field for key, field in after_fields.items() if key in common_field_keys],
        lambda field: field.field_key,
        lambda field: field.parent_field.field_key if field.parent_field_id else None,
    )
    for key in sorted(common_field_keys, key=str):
        if before_field_predecessors.get(key) == after_field_predecessors.get(key):
            continue
        field = after_fields[key]
        entries.append(
            RequirementStructuredDiffEntry(
                change=change,
                scope=RequirementStructuredDiffEntry.Scope.SCHEMA,
                change_type=RequirementStructuredDiffEntry.ChangeType.MOVED,
                field_key=key,
                label=field.name,
                before_value={
                    "after_field_key": (
                        str(before_field_predecessors.get(key)) if before_field_predecessors.get(key) else None
                    )
                },
                after_value={
                    "after_field_key": (
                        str(after_field_predecessors.get(key)) if after_field_predecessors.get(key) else None
                    )
                },
                sort_key=field.sort_key,
                created_by=actor,
            )
        )

    before_rows = {row.row_key: row for row in before_revision.rows.select_related("parent_row", "table_field").prefetch_related("values__field")} if before_revision else {}
    after_rows = {row.row_key: row for row in after_revision.rows.select_related("parent_row", "table_field").prefetch_related("values__field")}
    common_row_keys = set(before_rows) & set(after_rows)
    before_predecessors = _ordered_predecessors(
        [row for key, row in before_rows.items() if key in common_row_keys],
        lambda row: row.row_key,
        lambda row: (row.parent_row.row_key if row.parent_row_id else None, row.table_field.field_key if row.table_field_id else None),
    )
    after_predecessors = _ordered_predecessors(
        [row for key, row in after_rows.items() if key in common_row_keys],
        lambda row: row.row_key,
        lambda row: (row.parent_row.row_key if row.parent_row_id else None, row.table_field.field_key if row.table_field_id else None),
    )
    for key in sorted(set(before_rows) | set(after_rows), key=str):
        before = before_rows.get(key)
        after = after_rows.get(key)
        before_value = _row_snapshot(before) if before else None
        after_value = _row_snapshot(after) if after else None
        scope_row = after or before
        scope = (
            RequirementStructuredDiffEntry.Scope.CHILD_ROW
            if scope_row.parent_row_id
            else RequirementStructuredDiffEntry.Scope.ROOT_ROW
        )
        parent_key = scope_row.parent_row.row_key if scope_row.parent_row_id else None
        if before is None or after is None or before_value != after_value:
            entries.append(
                RequirementStructuredDiffEntry(
                    change=change,
                    scope=scope,
                    change_type=(
                        RequirementStructuredDiffEntry.ChangeType.ADDED
                        if before is None
                        else RequirementStructuredDiffEntry.ChangeType.REMOVED
                        if after is None
                        else RequirementStructuredDiffEntry.ChangeType.MODIFIED
                    ),
                    row_key=key,
                    parent_row_key=parent_key,
                    label=scope_row.display_id or str(key),
                    before_value=before_value,
                    after_value=after_value,
                    sort_key=scope_row.sort_key,
                    created_by=actor,
                )
            )
        if before and after and before_predecessors.get(key) != after_predecessors.get(key):
            entries.append(
                RequirementStructuredDiffEntry(
                    change=change,
                    scope=scope,
                    change_type=RequirementStructuredDiffEntry.ChangeType.MOVED,
                    row_key=key,
                    parent_row_key=parent_key,
                    label=scope_row.display_id or str(key),
                    before_value={"after_row_key": str(before_predecessors.get(key)) if before_predecessors.get(key) else None},
                    after_value={"after_row_key": str(after_predecessors.get(key)) if after_predecessors.get(key) else None},
                    sort_key=scope_row.sort_key,
                    created_by=actor,
                )
            )
    RequirementStructuredDiffEntry.objects.bulk_create(entries, batch_size=500)
    summary = defaultdict(int)
    for entry in entries:
        summary[f"{entry.scope}_{entry.change_type}"] += 1
    change.structured_diff_summary = dict(summary)
    change.save(update_fields=["structured_diff_summary", "updated_at"])
    return entries
