"""数字字段的显示格式与取值范围。

配置存在字段行上，TypeExtraField 与 IssueFieldDefinition 同构：

- ``options.number_format``：``number`` 数值 / ``percent`` 百分比 / ``currency`` 金额，缺省为数值
- ``options.precision``：小数位数 0–6，缺省不限
- ``options.unit``：单位；百分比固定显示 %，不存
- ``validation.min`` / ``validation.max``：取值范围（闭区间），缺省不限

格式和单位只影响显示，存的始终是填写的数（百分比填 15 即 15%）。小数位数和取值范围在写入
工作项时生效，见 ``extra_field_value.validate_extra_field_values``。
"""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Optional, Tuple

from django.core.exceptions import ValidationError

NUMBER_FORMATS = ("number", "percent", "currency")
# 与 TypeExtraFieldValue.value_number 的 decimal_places 一致
MAX_PRECISION = 6
MAX_UNIT_LENGTH = 20


def _to_decimal(value: Any) -> Optional[Decimal]:
    """空值返回 None；不是有限数字抛 ValueError。"""

    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError from exc
    if not number.is_finite():
        raise ValueError
    return number


def _plain(number: Decimal) -> str:
    return format(number.normalize(), "f")


def _json_number(number: Decimal):
    return int(number) if number == number.to_integral_value() else float(number)


def number_precision(field) -> Optional[int]:
    options = field.options if isinstance(field.options, dict) else {}
    precision = options.get("precision")
    if isinstance(precision, bool) or not isinstance(precision, int):
        return None
    return precision if 0 <= precision <= MAX_PRECISION else None


def number_bounds(field) -> Tuple[Optional[Decimal], Optional[Decimal]]:
    validation = field.validation if isinstance(field.validation, dict) else {}
    bounds = []
    for key in ("min", "max"):
        try:
            bounds.append(_to_decimal(validation.get(key)))
        except ValueError:
            bounds.append(None)
    return bounds[0], bounds[1]


def _round(field, number: Decimal) -> Decimal:
    precision = number_precision(field)
    if precision is None:
        return number
    return number.quantize(Decimal(1).scaleb(-precision), rounding=ROUND_HALF_UP)


def coerce_number(field, value: Any) -> Tuple[Optional[Decimal], Optional[str]]:
    """把填写的值转成 Decimal，并按字段的小数位数四舍五入。返回 ``(number, error)``。"""

    try:
        number = _to_decimal(value)
        return (None if number is None else _round(field, number)), None
    except (InvalidOperation, ValueError):
        return None, "数值格式不合法"


def number_range_error(field, number: Decimal) -> Optional[str]:
    low, high = number_bounds(field)
    if low is not None and number < low:
        return f"不能小于 {_plain(low)}"
    if high is not None and number > high:
        return f"不能大于 {_plain(high)}"
    return None


def is_same_number(left: Any, right: Any) -> bool:
    try:
        left_number, right_number = _to_decimal(left), _to_decimal(right)
    except ValueError:
        return False
    return left_number is not None and left_number == right_number


def normalize_number_config(field) -> None:
    """校验并规整数字字段的格式 / 范围 / 默认值，就地写回 field；不合法抛 ValidationError。"""

    if field.field_type != "number":
        return

    options = dict(field.options) if isinstance(field.options, dict) else {}
    number_format = options.pop("number_format", None) or "number"
    if number_format not in NUMBER_FORMATS:
        raise ValidationError("数字格式不合法")
    precision = options.pop("precision", None)
    if precision == "":
        precision = None
    if precision is not None and (
        isinstance(precision, bool) or not isinstance(precision, int) or not 0 <= precision <= MAX_PRECISION
    ):
        raise ValidationError(f"小数位数必须是 0 到 {MAX_PRECISION} 的整数")
    unit = str(options.pop("unit", None) or "").strip()
    if number_format == "percent":
        unit = ""
    if len(unit) > MAX_UNIT_LENGTH:
        raise ValidationError(f"单位不能超过 {MAX_UNIT_LENGTH} 个字符")
    # 只存非缺省项，没配过格式的字段 options 保持原样
    if number_format != "number":
        options["number_format"] = number_format
    if precision is not None:
        options["precision"] = precision
    if unit:
        options["unit"] = unit
    field.options = options

    validation = dict(field.validation) if isinstance(field.validation, dict) else {}
    bounds = {}
    for key, label in (("min", "最小值"), ("max", "最大值")):
        try:
            bounds[key] = _to_decimal(validation.pop(key, None))
        except ValueError as exc:
            raise ValidationError(f"{label}必须是数字") from exc
    if bounds["min"] is not None and bounds["max"] is not None and bounds["min"] > bounds["max"]:
        raise ValidationError("最小值不能大于最大值")
    for key, number in bounds.items():
        if number is not None:
            validation[key] = _json_number(number)
    field.validation = validation

    default, error = coerce_number(field, field.default_value)
    if error:
        raise ValidationError("默认值必须是数字")
    if default is None:
        return
    range_error = number_range_error(field, default)
    if range_error:
        raise ValidationError(f"默认值{range_error}")
    if not is_same_number(default, field.default_value):
        field.default_value = _json_number(default)
