# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""工作项类型自定义字段（TypeExtraField）值的校验与持久化辅助。

`IssueCreateSerializer` 在 `validate / create / update / to_representation` 中
会复用本模块，把字段类型分发、值列归一化、必填校验、`Issue` 与
`TypeExtraFieldValue` 的批量 upsert 等逻辑收敛到一处。
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Iterable, List, Optional, Tuple

from django.db import IntegrityError, transaction

from plane.db.models import (
    ProjectMember,
    TypeExtraField,
    TypeExtraFieldValue,
    User,
)


FIELD_TYPE_TEXT = "text"
FIELD_TYPE_NUMBER = "number"
FIELD_TYPE_DATE = "date"
FIELD_TYPE_BOOLEAN = "boolean"
FIELD_TYPE_SELECT = "select"
FIELD_TYPE_USER = "user"


def _is_value_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if isinstance(value, (list, tuple, dict)) and len(value) == 0:
        return True
    return False


def _coerce_value_for_field(
    field: TypeExtraField, value: Any
) -> Tuple[Any, Optional[str]]:
    """根据字段类型把前端传入的 value 归一化为可持久化的形态。

    返回 `(normalized_value, error_message)`：当 `error_message` 非空表示校验失败。
    """

    field_type = field.field_type

    if _is_value_empty(value):
        return None, None

    if field_type == FIELD_TYPE_TEXT:
        if not isinstance(value, str):
            value = str(value)
        return value, None

    if field_type == FIELD_TYPE_NUMBER:
        try:
            return Decimal(str(value)), None
        except (InvalidOperation, TypeError, ValueError):
            return None, "数值格式不合法"

    if field_type == FIELD_TYPE_DATE:
        if isinstance(value, date) and not isinstance(value, datetime):
            return value, None
        if isinstance(value, datetime):
            return value.date(), None
        try:
            return datetime.strptime(str(value)[:10], "%Y-%m-%d").date(), None
        except (TypeError, ValueError):
            return None, "日期格式不合法，请使用 YYYY-MM-DD"

    if field_type == FIELD_TYPE_BOOLEAN:
        if isinstance(value, bool):
            return value, None
        if isinstance(value, (int, float)):
            return bool(value), None
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes"}:
                return True, None
            if normalized in {"false", "0", "no"}:
                return False, None
        return None, "布尔值格式不合法"

    if field_type == FIELD_TYPE_SELECT:
        allowed = _select_option_values(field)
        if _is_multi_selection(field):
            if not isinstance(value, (list, tuple)):
                return None, "多选字段需要传入数组"
            values = list(value)
            if allowed:
                invalid = [v for v in values if v not in allowed]
                if invalid:
                    return None, "所选选项不在可选范围内"
            return values, None
        if isinstance(value, (list, tuple)):
            return None, "单选字段不支持多个值"
        if allowed and value not in allowed:
            return None, "所选选项不在可选范围内"
        return value, None

    if field_type == FIELD_TYPE_USER:
        if _is_multi_selection(field):
            if not isinstance(value, (list, tuple)):
                return None, "多选用户字段需要传入数组"
            user_ids = [str(v) for v in value if v not in (None, "")]
            if not user_ids:
                return None, None
            unique_ids = set(user_ids)
            valid_count = ProjectMember.objects.filter(
                project_id=field.project_id,
                member_id__in=list(unique_ids),
                is_active=True,
            ).values("member_id").distinct().count()
            if valid_count != len(unique_ids):
                return None, "存在不属于当前项目的成员"
            return user_ids, None
        if isinstance(value, (list, tuple)):
            return None, "单选用户字段不支持多个值"
        if not ProjectMember.objects.filter(
            project_id=field.project_id,
            member_id=value,
            is_active=True,
        ).exists():
            return None, "该用户不是当前项目成员"
        return str(value), None

    return value, None


def _is_multi_selection(field: TypeExtraField) -> bool:
    """从 field.options 推断 select / user 字段是否为多选模式。

    与前端 `getSelectionMode` 保持一致，兼容以下写法：
    - `{"selection_mode": "multiple"}` 或 `"multi"`
    - `{"selectionMode": "multiple"}`
    - `{"multiple": True}`
    """

    options = field.options
    if not isinstance(options, dict):
        return False
    mode = options.get("selection_mode") or options.get("selectionMode")
    if mode in {"multiple", "multi"}:
        return True
    return options.get("multiple") is True


def _select_option_values(field: TypeExtraField) -> List[Any]:
    """从 field.options 中提取允许的选项值集合。

    支持以下两种存储形式：
    - `{"options": [{"key": "a", "label": "A"}, ...]}`
    - `[{"key": "a", "label": "A"}, ...]` 或 `["a", "b", ...]`
    """

    options = field.options or {}
    raw_options: Iterable[Any]
    if isinstance(options, dict):
        raw_options = options.get("options") or options.get("choices") or []
    else:
        raw_options = options

    result: List[Any] = []
    for item in raw_options or []:
        if isinstance(item, dict):
            value = item.get("key") if "key" in item else item.get("value")
            if value is not None:
                result.append(value)
        else:
            result.append(item)
    return result


def _value_columns(field: TypeExtraField, normalized_value: Any) -> Dict[str, Any]:
    """把归一化后的值按字段类型写入到对应的具体列。"""

    columns: Dict[str, Any] = {
        "value": None,
        "value_text": None,
        "value_number": None,
        "value_date": None,
    }
    if normalized_value is None:
        return columns

    if field.field_type == FIELD_TYPE_TEXT:
        columns["value_text"] = normalized_value
    elif field.field_type == FIELD_TYPE_NUMBER:
        columns["value_number"] = normalized_value
    elif field.field_type == FIELD_TYPE_DATE:
        columns["value_date"] = normalized_value
    columns["value"] = _value_for_jsonfield(field, normalized_value)
    return columns


def _value_for_jsonfield(field: TypeExtraField, normalized_value: Any) -> Any:
    """JSON 列保存的值（确保 JSON 可序列化）。"""

    if isinstance(normalized_value, Decimal):
        return float(normalized_value)
    if isinstance(normalized_value, date) and not isinstance(
        normalized_value, datetime
    ):
        return normalized_value.isoformat()
    if isinstance(normalized_value, datetime):
        return normalized_value.isoformat()
    return normalized_value


def validate_extra_field_values(
    raw_values: List[Dict[str, Any]],
    project_id: str,
    issue_type_id: Optional[str],
) -> Tuple[List[Tuple[TypeExtraField, Any]], Dict[str, List[str]]]:
    """对一组 `extra_field_values` 做项目/类型/必填/类型校验。

    返回 `(items, errors)`：
    - `items` 是 `(field, normalized_value)` 列表，可直接喂给 `save_extra_field_values`
    - `errors` 当非空时，调用方应抛 `ValidationError({"extra_field_values": errors})`
    """

    if not issue_type_id:
        return [], {}

    fields_qs = TypeExtraField.objects.filter(
        project_id=project_id,
        issue_type_id=issue_type_id,
        is_active=True,
        deleted_at__isnull=True,
    )
    field_map: Dict[str, TypeExtraField] = {str(f.id): f for f in fields_qs}

    errors: Dict[str, List[str]] = {}
    items: List[Tuple[TypeExtraField, Any]] = []
    seen_ids = set()

    for raw in raw_values or []:
        field_id = str(raw.get("extra_field_id"))
        if field_id in seen_ids:
            errors.setdefault(field_id, []).append("同一字段不能重复填写")
            continue
        seen_ids.add(field_id)

        field = field_map.get(field_id)
        if field is None:
            errors.setdefault(field_id, []).append("字段不属于该工作项类型")
            continue

        normalized, err = _coerce_value_for_field(field, raw.get("value"))
        if err:
            errors.setdefault(field_id, []).append(err)
            continue
        items.append((field, normalized))

    for field_id, field in field_map.items():
        if field.is_required and field_id not in seen_ids:
            errors.setdefault(field_id, []).append(f"{field.name} 为必填字段")
        if field.is_required and field_id in seen_ids:
            normalized = next((v for f, v in items if str(f.id) == field_id), None)
            if normalized is None:
                errors.setdefault(field_id, []).append(f"{field.name} 为必填字段")

    return items, errors


def save_extra_field_values(
    issue,
    items: List[Tuple[TypeExtraField, Any]],
    project_id: str,
    workspace_id: str,
    actor_id: Optional[str] = None,
) -> None:
    """把校验后的字段值写入（或更新）`TypeExtraFieldValue`。

    使用 `(issue, extra_field)` 的唯一约束做 upsert：已存在则更新值列，
    不存在则创建。本次未提交的字段保持原值（增量更新）。
    """

    if not items:
        return

    with transaction.atomic():
        existing = {
            str(v.extra_field_id): v
            for v in TypeExtraFieldValue.objects.filter(
                issue=issue,
                deleted_at__isnull=True,
                extra_field_id__in=[f.id for f, _ in items],
            )
        }

        to_create: List[TypeExtraFieldValue] = []
        for field, normalized in items:
            columns = _value_columns(field, normalized)
            existing_value = existing.get(str(field.id))
            if existing_value is not None:
                for column, value in columns.items():
                    setattr(existing_value, column, value)
                if actor_id is not None:
                    existing_value.updated_by_id = actor_id
                existing_value.save(
                    update_fields=list(columns.keys())
                    + (["updated_by_id", "updated_at"] if actor_id else ["updated_at"])
                )
                continue
            to_create.append(
                TypeExtraFieldValue(
                    issue=issue,
                    extra_field=field,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    created_by_id=actor_id,
                    updated_by_id=actor_id,
                    **columns,
                )
            )

        if to_create:
            try:
                TypeExtraFieldValue.objects.bulk_create(to_create, batch_size=20)
            except IntegrityError:
                pass


def serialize_extra_field_values(issue) -> List[Dict[str, Any]]:
    """把 issue 已存在的扩展字段值组装成统一形态返回前端。"""

    queryset = TypeExtraFieldValue.objects.filter(
        issue=issue,
        deleted_at__isnull=True,
    ).select_related("extra_field")
    return [
        {
            "extra_field_id": str(item.extra_field_id),
            "field_type": item.extra_field.field_type,
            "value": item.value,
        }
        for item in queryset
    ]
