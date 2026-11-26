"""需求字段「取值规则 / 动态取值」的规则解析与取值校验。

取值规则（field_type = rule）是每条需求各自填写的一段简写表达式，动态取值
（field_type = rule_value）按同级那条规则决定怎么填、填什么才合法：

    {西欧,中东欧,其他}      选项
    [1,30]                区间，含两端
    (0,15]                区间，不含左端
    {[1,28],月末}          区间或选项
    [0.1%,2%]             带单位的区间
    [0,100]/5             按步长取值
    [2026-01-01,2026-12-31]  日期区间
    富文本                 自由填写

本模块是**纯函数**，不依赖 Django，前端 `apps/web/core/components/requirements/rule/`
有一份逐例对齐的 TypeScript 实现 —— 改语法两边一起改。错误一律返回错误码，中文文案由
`describe_rule_error` / `describe_value_error` 统一给，调用方不要自己拼。
"""

import datetime
import re
from decimal import Decimal

RICH_KEYWORD = "富文本"

_OPEN_BRACES = "{｛"
_CLOSE_BRACES = "}｝"
_OPEN_BRACKETS = "[［【(（"
_CLOSE_BRACKETS = "]］】)）"
_COMMAS = ",，"

#: 区间那一项里的全角结构字符 -> 半角。选项文字不做这层转换（原样保留）。
_INTERVAL_TRANSLATION = str.maketrans(
    {
        "｛": "{",
        "｝": "}",
        "［": "[",
        "【": "[",
        "］": "]",
        "】": "]",
        "（": "(",
        "）": ")",
        "，": ",",
        "％": "%",
        "／": "/",
    }
)

_UNBOUNDED = frozenset({"", "∞", "+∞", "-∞"})
# 数字一律写 [0-9]：Python 的 \d 会收全角数字，前端的 \d 不会
_DATE_RE = re.compile(r"^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$")
_NUMBER_WITH_UNIT_RE = re.compile(r"^([+-]?[0-9]+(?:\.[0-9]+)?)\s*(.*)$", re.S)
_NUMBER_RE = re.compile(r"^[+-]?[0-9]+(?:\.[0-9]+)?$")


class _RuleError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def _canonical_number(text):
    return text[1:] if text.startswith("+") else text


def _decimals(number_text):
    return len(number_text.split(".", 1)[1]) if "." in number_text else 0


def _parse_date(text):
    """`YYYY-M-D` -> 补零后的 ISO 日期；写法不对或日期不存在返回 None。"""
    match = _DATE_RE.match(text)
    if not match:
        return None
    try:
        return datetime.date(
            int(match.group(1)), int(match.group(2)), int(match.group(3))
        ).isoformat()
    except ValueError:
        return None


def _parse_number_with_unit(text):
    """`12.5 V` -> ("12.5", "V")；不是数值开头、或单位以数字 / 小数点开头返回 None。"""
    match = _NUMBER_WITH_UNIT_RE.match(text)
    if not match:
        return None
    unit = match.group(2).strip()
    if unit and unit[0] in "0123456789.":
        return None
    return _canonical_number(match.group(1)), unit


def _parse_bound(text):
    text = text.strip()
    if text in _UNBOUNDED:
        return ("none", None, "")
    if _DATE_RE.match(text):
        # 写成日期的样子但日期不存在（2026-13-40）：直接报错，别让它落到数值分支
        # 被读成「2026 + 单位 -13-40」
        date = _parse_date(text)
        if date is None:
            raise _RuleError("bad_bound")
        return ("date", date, "")
    number = _parse_number_with_unit(text)
    if number is not None:
        return ("number", number[0], number[1])
    raise _RuleError("bad_bound")


def _parse_interval(item):
    text = item.translate(_INTERVAL_TRANSLATION)
    close = max(text.rfind("]"), text.rfind(")"))
    if close < 1:
        raise _RuleError("unclosed_bracket")

    rest = text[close + 1 :].strip()
    step_text = None
    if rest:
        if not rest.startswith("/"):
            raise _RuleError("unrecognized")
        step_text = rest[1:].strip()

    parts = text[1:close].split(",")
    if len(parts) != 2:
        raise _RuleError("bad_interval")
    lo_kind, lo, lo_unit = _parse_bound(parts[0])
    hi_kind, hi, hi_unit = _parse_bound(parts[1])

    if lo_kind == "none" and hi_kind == "none":
        raise _RuleError("no_bound")
    kinds = {lo_kind, hi_kind} - {"none"}
    if len(kinds) > 1:
        raise _RuleError("mixed_bound_types")
    interval_type = kinds.pop()
    if lo_unit and hi_unit and lo_unit != hi_unit:
        raise _RuleError("unit_mismatch")
    unit = lo_unit or hi_unit

    lo_inclusive = text[0] == "[" and lo is not None
    hi_inclusive = text[close] == "]" and hi is not None
    if lo is not None and hi is not None:
        if interval_type == "number":
            low, high = Decimal(lo), Decimal(hi)
        else:
            low, high = lo, hi  # 补零后的 ISO 日期按字符串比就是按日期比
        if low > high:
            raise _RuleError("lo_gt_hi")
        if low == high and not (lo_inclusive and hi_inclusive):
            raise _RuleError("empty_range")

    step = None
    if step_text is not None:
        if interval_type == "date":
            raise _RuleError("step_on_date")
        parsed_step = _parse_number_with_unit(step_text)
        if parsed_step is None:
            raise _RuleError("bad_step")
        step, step_unit = parsed_step
        if step_unit and step_unit != unit:
            raise _RuleError("unit_mismatch")
        if Decimal(step) <= 0:
            raise _RuleError("bad_step")

    decimals = 0
    if interval_type == "number":
        decimals = max(
            _decimals(number) for number in (lo, hi, step) if number is not None
        )
    return {
        "type": interval_type,
        "lo": lo,
        "hi": hi,
        "lo_inclusive": lo_inclusive,
        "hi_inclusive": hi_inclusive,
        "unit": unit,
        "step": step,
        "decimals": decimals,
    }


def _split_set_items(inner):
    """按「深度 0 且不在 ASCII 双引号内」的逗号切分。"""
    items = []
    current = []
    depth = 0
    in_quote = False
    for char in inner:
        if char == '"':
            in_quote = not in_quote
        elif not in_quote:
            if char in _OPEN_BRACKETS:
                depth += 1
            elif char in _CLOSE_BRACKETS:
                depth = max(0, depth - 1)
            elif char in _COMMAS and depth == 0:
                items.append("".join(current))
                current = []
                continue
        current.append(char)
    items.append("".join(current))
    return items


def _parse_set(text):
    if len(text) < 2 or text[-1] not in _CLOSE_BRACES:
        raise _RuleError("unclosed_brace")
    options = []
    intervals = []
    for raw_item in _split_set_items(text[1:-1]):
        item = raw_item.strip()
        if not item:
            raise _RuleError("empty_item")
        if item[0] in _OPEN_BRACKETS:
            intervals.append(_parse_interval(item))
            continue
        if len(item) >= 2 and item[0] == '"' and item[-1] == '"':
            item = item[1:-1]
            if not item:
                raise _RuleError("empty_item")
        if item in options:
            raise _RuleError("duplicate_option")
        options.append(item)
    return options, intervals


def parse_rule(expr):
    """解析一条规则表达式。

    成功：{"ok": True, "rich": bool, "options": [...], "intervals": [...]}
    空串：{"ok": True, "empty": True}
    失败：{"ok": False, "error": "<错误码>"}
    """
    text = expr.strip() if isinstance(expr, str) else ""
    if not text:
        return {"ok": True, "empty": True}
    if text == RICH_KEYWORD:
        return {"ok": True, "rich": True, "options": [], "intervals": []}
    try:
        if text[0] in _OPEN_BRACES:
            options, intervals = _parse_set(text)
        elif text[0] in _OPEN_BRACKETS:
            options, intervals = [], [_parse_interval(text)]
        else:
            raise _RuleError("unrecognized")
    except _RuleError as exc:
        return {"ok": False, "error": exc.code}
    return {"ok": True, "rich": False, "options": options, "intervals": intervals}


def rule_has_options(parsed):
    return bool(parsed.get("ok") and parsed.get("options"))


def rule_is_usable(parsed):
    """解析成功且不是空规则 —— 只有这种规则才能拿来校验取值。"""
    return bool(parsed.get("ok")) and not parsed.get("empty")


def _check_number(interval, value):
    text = value
    unit = interval["unit"]
    if unit and text.endswith(unit):
        text = text[: -len(unit)].strip()
    if not _NUMBER_RE.match(text):
        return None, "not_number"
    text = _canonical_number(text)
    if _decimals(text) > interval["decimals"]:
        return None, "too_many_decimals"
    number = Decimal(text)
    lo, hi = interval["lo"], interval["hi"]
    if lo is not None:
        low = Decimal(lo)
        if number < low or (number == low and not interval["lo_inclusive"]):
            return None, "out_of_range"
    if hi is not None:
        high = Decimal(hi)
        if number > high or (number == high and not interval["hi_inclusive"]):
            return None, "out_of_range"
    if interval["step"] is not None:
        base = Decimal(lo) if lo is not None else Decimal(0)
        if (number - base) % Decimal(interval["step"]) != 0:
            return None, "step_mismatch"
    return text, None


def _check_date(interval, value):
    date = _parse_date(value)
    if date is None:
        return None, "invalid_date"
    lo, hi = interval["lo"], interval["hi"]
    if lo is not None and (date < lo or (date == lo and not interval["lo_inclusive"])):
        return None, "out_of_range"
    if hi is not None and (date > hi or (date == hi and not interval["hi_inclusive"])):
        return None, "out_of_range"
    return date, None


def _check_single(parsed, allow_custom, value):
    options = parsed["options"]
    if value in options:
        return value, None
    first_error = None
    for interval in parsed["intervals"]:
        checker = _check_number if interval["type"] == "number" else _check_date
        normalized, error = checker(interval, value)
        if error is None:
            return normalized, None
        if first_error is None:
            first_error = error
    if allow_custom and options:
        return value, None
    return None, first_error or "not_in_options"


def check_rule_value(parsed, multiple, allow_custom, value):
    """按规则校验并规范化一个取值。

    parsed 是 parse_rule 的成功结果（非空规则）。返回
    {"ok": True, "value": 规范值} 或 {"ok": False, "error": "<错误码>"}。
    """
    if parsed.get("rich"):
        if value is None:
            return {"ok": True, "value": None}
        if not isinstance(value, str):
            return {"ok": False, "error": "must_be_string"}
        return {"ok": True, "value": value}

    if parsed["options"] and multiple:
        if value is None:
            return {"ok": True, "value": None}
        if not isinstance(value, list):
            return {"ok": False, "error": "must_be_list"}
        items = []
        for item in value:
            if not isinstance(item, str):
                return {"ok": False, "error": "must_be_string"}
            item = item.strip()
            if not item:
                continue
            if item in items:
                return {"ok": False, "error": "duplicate"}
            items.append(item)
        normalized_items = []
        for item in items:
            normalized, error = _check_single(parsed, allow_custom, item)
            if error is not None:
                return {"ok": False, "error": error}
            normalized_items.append(normalized)
        return {"ok": True, "value": normalized_items or None}

    if value is None:
        return {"ok": True, "value": None}
    if not isinstance(value, str):
        return {"ok": False, "error": "must_be_string"}
    text = value.strip()
    if not text:
        return {"ok": True, "value": None}
    normalized, error = _check_single(parsed, allow_custom, text)
    if error is not None:
        return {"ok": False, "error": error}
    return {"ok": True, "value": normalized}


# ---------------------------------------------------------------------------
# 中文文案
# ---------------------------------------------------------------------------

_RULE_ERROR_MESSAGES = {
    "unrecognized": "无法识别的写法",
    "unclosed_brace": "缺少右花括号",
    "unclosed_bracket": "缺少右括号",
    "empty_item": "存在空的选项",
    "duplicate_option": "选项重复",
    "bad_interval": "区间需要写成 [下限,上限]",
    "bad_bound": "区间边界无法识别",
    "no_bound": "区间至少需要一个边界",
    "mixed_bound_types": "区间两端的类型不一致",
    "unit_mismatch": "单位不一致",
    "lo_gt_hi": "下限不能大于上限",
    "empty_range": "区间内没有可取的值",
    "bad_step": "步长必须是大于 0 的数",
    "step_on_date": "日期区间不支持步长",
}

_VALUE_ERROR_MESSAGES = {
    "not_in_options": "不在可选项内",
    "not_number": "请填写数值",
    "invalid_date": "日期格式应为 YYYY-MM-DD",
    "must_be_string": "取值格式不正确",
    "must_be_list": "取值格式不正确",
    "duplicate": "取值不能重复",
}


def describe_rule_error(code):
    return _RULE_ERROR_MESSAGES.get(code, "无法识别的写法")


def format_interval(interval):
    """区间的展示写法，报错与导出用：`(0,15]`、`[0.1%,2%]`、`[0,100]/5`。"""
    unit = interval["unit"]

    def bound(value, unbounded):
        return f"{value}{unit}" if value is not None else unbounded

    # 无界一侧按惯例写成开区间
    text = (
        ("[" if interval["lo_inclusive"] else "(")
        + bound(interval["lo"], "-∞")
        + ","
        + bound(interval["hi"], "+∞")
        + ("]" if interval["hi_inclusive"] else ")")
    )
    if interval["step"] is not None:
        text += f"/{interval['step']}"
    return text


def describe_value_error(parsed, code):
    """取值错误码 -> 中文原因。区间类的原因按**第一个区间**描述（与错误码的取法一致）。"""
    interval = parsed["intervals"][0] if parsed.get("intervals") else None
    if interval is not None:
        if code == "out_of_range":
            return f"超出取值范围 {format_interval(interval)}"
        if code == "too_many_decimals":
            if interval["decimals"] == 0:
                return "只能填写整数"
            return f"最多保留 {interval['decimals']} 位小数"
        if code == "step_mismatch":
            return f"不符合步长 {interval['step']}"
    return _VALUE_ERROR_MESSAGES.get(code, "取值不符合规则")
