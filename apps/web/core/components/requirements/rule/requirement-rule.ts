/**
 * 「取值规则」的解析与「动态取值」的校验 —— 纯函数，不碰 React。
 *
 * 语法与后端 plane/utils/requirement_rule.py 逐条对应，两边的解析结果结构、错误码必须
 * 保持一致：前端据此决定控件形态并即时标红，真正拦保存的是后端。改这里的规则前先改那边。
 *
 *   {西欧,中东欧,其他}        选择
 *   [1,30]  (0,15]            区间（方括号含端点，圆括号不含）
 *   {[1,28],月末}             区间或选项
 *   [0.1%,2%]  [3V,40V]       带单位
 *   [0,100]/5                 步长
 *   [2026-01-01,2026-12-31]   日期
 *   富文本                    自由填写
 */
import type { TRequirementRuleValue, TRequirementValue } from "@plane/types";

export type TRuleInterval = {
  type: "number" | "date";
  /** 规范数字串或 YYYY-MM-DD；null = 无界 */
  lo: string | null;
  hi: string | null;
  lo_inclusive: boolean;
  hi_inclusive: boolean;
  unit: string;
  step: string | null;
  /** 允许的小数位数，取自规则的写法 */
  decimals: number;
};

export type TRuleParseError =
  | "unrecognized"
  | "unclosed_brace"
  | "unclosed_bracket"
  | "empty_item"
  | "duplicate_option"
  | "bad_interval"
  | "bad_bound"
  | "mixed_bound_types"
  | "unit_mismatch"
  | "no_bound"
  | "lo_gt_hi"
  | "empty_range"
  | "bad_step"
  | "step_on_date";

export type TRuleDefinition = { rich: boolean; options: string[]; intervals: TRuleInterval[] };

export type TParsedRule =
  | { ok: true; empty: true }
  | ({ ok: true; empty?: undefined } & TRuleDefinition)
  | { ok: false; error: TRuleParseError };

export type TRuleValueError =
  | "must_be_string"
  | "must_be_list"
  | "duplicate"
  | "not_in_options"
  | "not_number"
  | "too_many_decimals"
  | "out_of_range"
  | "step_mismatch"
  | "invalid_date";

export type TRuleValueCheck = { ok: true; value: string | string[] | null } | { ok: false; error: TRuleValueError };

const OPEN_BRACE = "{｛";
const CLOSE_BRACE = "}｝";
const OPEN_BRACKET = "[［【(（";
const CLOSE_BRACKET = "]］】)）";
const COMMA = ",，";
const RICH_KEYWORD = "富文本";
const UNBOUNDED = ["", "∞", "+∞", "-∞"];

const NUMBER_WITH_UNIT = /^([+-]?[0-9]+(?:\.[0-9]+)?)\s*(.*)$/;
const PLAIN_NUMBER = /^[+-]?[0-9]+(?:\.[0-9]+)?$/;
const DATE = /^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$/;

const FULL_WIDTH: Record<string, string> = {
  "［": "[",
  "【": "[",
  "］": "]",
  "】": "]",
  "（": "(",
  "）": ")",
  "，": ",",
  "％": "%",
  "／": "/",
};

const toHalfWidth = (text: string) =>
  Array.from(text)
    .map((char) => FULL_WIDTH[char] ?? char)
    .join("");

const stripPlus = (text: string) => (text.startsWith("+") ? text.slice(1) : text);

const decimalsOf = (text: string) => {
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
};

/** 十进制数字串放大成整数再比较，避开浮点误差（0.1 + 0.2 之类） */
const toScaled = (text: string, scale: number): bigint => {
  const negative = text.startsWith("-");
  const body = text.replace(/^[+-]/, "");
  const [whole, fraction = ""] = body.split(".");
  const scaled = BigInt(whole + fraction.padEnd(scale, "0"));
  return negative ? -scaled : scaled;
};

const compareNumbers = (left: string, right: string) => {
  const scale = Math.max(decimalsOf(left), decimalsOf(right));
  const a = toScaled(left, scale);
  const b = toScaled(right, scale);
  return a < b ? -1 : a > b ? 1 : 0;
};

const normalizeDate = (text: string): string | null => {
  const matched = DATE.exec(text);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > days) return null;
  return `${matched[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

type TBound =
  | { kind: "none" }
  | { kind: "number"; value: string; unit: string }
  | { kind: "date"; value: string }
  | { kind: "error" };

const parseBound = (raw: string): TBound => {
  const text = raw.trim();
  if (UNBOUNDED.includes(text)) return { kind: "none" };
  if (DATE.test(text)) {
    const date = normalizeDate(text);
    return date ? { kind: "date", value: date } : { kind: "error" };
  }
  const matched = NUMBER_WITH_UNIT.exec(text);
  if (!matched) return { kind: "error" };
  const unit = matched[2].trim();
  if (/^[0-9.]/.test(unit)) return { kind: "error" };
  return { kind: "number", value: stripPlus(matched[1]), unit };
};

type TIntervalResult = { ok: true; interval: TRuleInterval } | { ok: false; error: TRuleParseError };

const parseInterval = (raw: string): TIntervalResult => {
  const text = toHalfWidth(raw.trim());
  const closeIndex = Math.max(text.lastIndexOf("]"), text.lastIndexOf(")"));
  if (closeIndex <= 0) return { ok: false, error: "unclosed_bracket" };
  const tail = text.slice(closeIndex + 1).trim();
  if (tail && !tail.startsWith("/")) return { ok: false, error: "unrecognized" };
  const stepText = tail ? tail.slice(1).trim() : null;

  const parts = text.slice(1, closeIndex).split(",");
  if (parts.length !== 2) return { ok: false, error: "bad_interval" };
  const lo = parseBound(parts[0]);
  const hi = parseBound(parts[1]);
  if (lo.kind === "error" || hi.kind === "error") return { ok: false, error: "bad_bound" };
  if (lo.kind === "none" && hi.kind === "none") return { ok: false, error: "no_bound" };
  if (lo.kind !== "none" && hi.kind !== "none" && lo.kind !== hi.kind) {
    return { ok: false, error: "mixed_bound_types" };
  }

  const loInclusive = text[0] === "[" && lo.kind !== "none";
  const hiInclusive = text[closeIndex] === "]" && hi.kind !== "none";
  const loValue = lo.kind === "none" ? null : lo.value;
  const hiValue = hi.kind === "none" ? null : hi.value;
  const isDate = lo.kind === "date" || hi.kind === "date";

  if (isDate) {
    if (stepText !== null) return { ok: false, error: "step_on_date" };
    if (loValue !== null && hiValue !== null) {
      if (loValue > hiValue) return { ok: false, error: "lo_gt_hi" };
      if (loValue === hiValue && !(loInclusive && hiInclusive)) return { ok: false, error: "empty_range" };
    }
    return {
      ok: true,
      interval: {
        type: "date",
        lo: loValue,
        hi: hiValue,
        lo_inclusive: loInclusive,
        hi_inclusive: hiInclusive,
        unit: "",
        step: null,
        decimals: 0,
      },
    };
  }

  const loUnit = lo.kind === "number" ? lo.unit : "";
  const hiUnit = hi.kind === "number" ? hi.unit : "";
  if (loUnit && hiUnit && loUnit !== hiUnit) return { ok: false, error: "unit_mismatch" };
  const unit = loUnit || hiUnit;
  if (loValue !== null && hiValue !== null) {
    const order = compareNumbers(loValue, hiValue);
    if (order > 0) return { ok: false, error: "lo_gt_hi" };
    if (order === 0 && !(loInclusive && hiInclusive)) return { ok: false, error: "empty_range" };
  }

  let step: string | null = null;
  if (stepText !== null) {
    const matched = NUMBER_WITH_UNIT.exec(stepText);
    if (!matched) return { ok: false, error: "bad_step" };
    const stepUnit = matched[2].trim();
    if (/^[0-9.]/.test(stepUnit)) return { ok: false, error: "bad_step" };
    if (stepUnit && stepUnit !== unit) return { ok: false, error: "unit_mismatch" };
    step = stripPlus(matched[1]);
    if (compareNumbers(step, "0") <= 0) return { ok: false, error: "bad_step" };
  }

  return {
    ok: true,
    interval: {
      type: "number",
      lo: loValue,
      hi: hiValue,
      lo_inclusive: loInclusive,
      hi_inclusive: hiInclusive,
      unit,
      step,
      decimals: Math.max(decimalsOf(loValue ?? ""), decimalsOf(hiValue ?? ""), decimalsOf(step ?? "")),
    },
  };
};

/** 集合内部按「深度 0、不在引号内」的逗号切分 */
const splitSetItems = (inner: string): string[] => {
  const items: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const char of Array.from(inner)) {
    if (char === '"') {
      quoted = !quoted;
      current += char;
      continue;
    }
    if (!quoted) {
      if (OPEN_BRACKET.includes(char)) depth += 1;
      else if (CLOSE_BRACKET.includes(char)) depth = Math.max(0, depth - 1);
      else if (COMMA.includes(char) && depth === 0) {
        items.push(current);
        current = "";
        continue;
      }
    }
    current += char;
  }
  items.push(current);
  return items;
};

export const parseRule = (raw: string | null | undefined): TParsedRule => {
  const expr = (raw ?? "").trim();
  if (!expr) return { ok: true, empty: true };
  if (expr === RICH_KEYWORD) return { ok: true, rich: true, options: [], intervals: [] };

  const first = Array.from(expr)[0];
  if (OPEN_BRACKET.includes(first)) {
    const result = parseInterval(expr);
    return result.ok ? { ok: true, rich: false, options: [], intervals: [result.interval] } : result;
  }
  if (!OPEN_BRACE.includes(first)) return { ok: false, error: "unrecognized" };

  const chars = Array.from(expr);
  if (chars.length < 2 || !CLOSE_BRACE.includes(chars[chars.length - 1])) return { ok: false, error: "unclosed_brace" };
  const options: string[] = [];
  const intervals: TRuleInterval[] = [];
  for (const rawItem of splitSetItems(chars.slice(1, -1).join(""))) {
    const item = rawItem.trim();
    if (!item) return { ok: false, error: "empty_item" };
    if (OPEN_BRACKET.includes(Array.from(item)[0])) {
      const result = parseInterval(item);
      if (!result.ok) return result;
      intervals.push(result.interval);
      continue;
    }
    const option = item.length >= 2 && item.startsWith('"') && item.endsWith('"') ? item.slice(1, -1) : item;
    if (!option) return { ok: false, error: "empty_item" };
    if (options.includes(option)) return { ok: false, error: "duplicate_option" };
    options.push(option);
  }
  return { ok: true, rich: false, options, intervals };
};

type TSingleCheck = { ok: true; value: string } | { ok: false; error: TRuleValueError };

const checkAgainstInterval = (interval: TRuleInterval, raw: string): TSingleCheck => {
  if (interval.type === "date") {
    const date = normalizeDate(raw);
    if (!date) return { ok: false, error: "invalid_date" };
    if (interval.lo !== null && (date < interval.lo || (date === interval.lo && !interval.lo_inclusive))) {
      return { ok: false, error: "out_of_range" };
    }
    if (interval.hi !== null && (date > interval.hi || (date === interval.hi && !interval.hi_inclusive))) {
      return { ok: false, error: "out_of_range" };
    }
    return { ok: true, value: date };
  }

  let text = raw;
  if (interval.unit && text.endsWith(interval.unit)) text = text.slice(0, -interval.unit.length).trim();
  if (!PLAIN_NUMBER.test(text)) return { ok: false, error: "not_number" };
  const value = stripPlus(text);
  if (decimalsOf(value) > interval.decimals) return { ok: false, error: "too_many_decimals" };
  if (interval.lo !== null) {
    const order = compareNumbers(value, interval.lo);
    if (order < 0 || (order === 0 && !interval.lo_inclusive)) return { ok: false, error: "out_of_range" };
  }
  if (interval.hi !== null) {
    const order = compareNumbers(value, interval.hi);
    if (order > 0 || (order === 0 && !interval.hi_inclusive)) return { ok: false, error: "out_of_range" };
  }
  if (interval.step !== null) {
    const base = interval.lo ?? "0";
    const scale = Math.max(decimalsOf(value), decimalsOf(base), decimalsOf(interval.step));
    const offset = toScaled(value, scale) - toScaled(base, scale);
    if (offset % toScaled(interval.step, scale) !== BigInt(0)) return { ok: false, error: "step_mismatch" };
  }
  return { ok: true, value };
};

/** 单个值（已去空白、非空）对一条规则的校验 */
export const checkRuleEntry = (rule: TRuleDefinition, allowCustom: boolean, text: string): TSingleCheck => {
  if (rule.options.includes(text)) return { ok: true, value: text };
  let firstError: TRuleValueError | null = null;
  for (const interval of rule.intervals) {
    const result = checkAgainstInterval(interval, text);
    if (result.ok) return result;
    firstError ??= result.error;
  }
  if (allowCustom && rule.options.length) return { ok: true, value: text };
  return { ok: false, error: firstError ?? "not_in_options" };
};

export const checkRuleValue = (
  rule: TRuleDefinition,
  multiple: boolean,
  allowCustom: boolean,
  value: unknown
): TRuleValueCheck => {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (rule.rich) {
    if (typeof value !== "string") return { ok: false, error: "must_be_string" };
    return { ok: true, value };
  }
  if (multiple && rule.options.length) {
    if (!Array.isArray(value)) return { ok: false, error: "must_be_list" };
    // 与后端同序：先在去空白后的原值上判重，再逐个校验并规范化
    const items: string[] = [];
    for (const item of value) {
      if (typeof item !== "string") return { ok: false, error: "must_be_string" };
      const text = item.trim();
      if (!text) continue;
      if (items.includes(text)) return { ok: false, error: "duplicate" };
      items.push(text);
    }
    const checked: string[] = [];
    for (const text of items) {
      const result = checkRuleEntry(rule, allowCustom, text);
      if (!result.ok) return result;
      checked.push(result.value);
    }
    return { ok: true, value: checked.length ? checked : null };
  }
  if (typeof value !== "string") return { ok: false, error: "must_be_string" };
  const text = value.trim();
  if (!text) return { ok: true, value: null };
  return checkRuleEntry(rule, allowCustom, text);
};

/* ---------------------------------------------------------------------------
 * 值的读取：字段值 -> 规则 / 取值。读侧一律容错，形状不对就当没填。
 * --------------------------------------------------------------------------- */

export const EMPTY_RULE_VALUE: TRequirementRuleValue = { expr: "", multiple: false, allow_custom: false };

export const asRuleValue = (value: TRequirementValue | undefined): TRequirementRuleValue | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<TRequirementRuleValue>;
  if (typeof candidate.expr !== "string" || !candidate.expr.trim()) return null;
  return {
    expr: candidate.expr,
    multiple: Boolean(candidate.multiple),
    allow_custom: Boolean(candidate.allow_custom),
  };
};

export const isRuleValue = (value: TRequirementValue | undefined): value is TRequirementRuleValue =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** 动态取值字段眼里的规则状态：没写 / 写错 / 可用 */
export type TResolvedRule =
  | { state: "none" }
  | { state: "invalid"; error: TRuleParseError }
  | { state: "ready"; rule: TRuleDefinition; multiple: boolean; allowCustom: boolean; expr: string };

export const resolveRule = (value: TRequirementValue | undefined): TResolvedRule => {
  const ruleValue = asRuleValue(value);
  if (!ruleValue) return { state: "none" };
  const parsed = parseRule(ruleValue.expr);
  if (!parsed.ok) return { state: "invalid", error: parsed.error };
  if (parsed.empty) return { state: "none" };
  const hasOptions = parsed.options.length > 0;
  return {
    state: "ready",
    rule: { rich: parsed.rich, options: parsed.options, intervals: parsed.intervals },
    multiple: hasOptions && ruleValue.multiple,
    allowCustom: hasOptions && ruleValue.allow_custom,
    expr: ruleValue.expr.trim(),
  };
};

/** 取值读成字符串数组。B 的「多选」后来改过时，A 的形状会与之不符，这里两种都认 */
export const ruleValueEntries = (value: TRequirementValue | undefined): string[] => {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item !== "");
  return [];
};

/* ---------------------------------------------------------------------------
 * 文案（与后端 requirement_rule.py 的 describe_rule_error / describe_value_error 同文）
 * --------------------------------------------------------------------------- */

const PARSE_ERROR_TEXT: Record<TRuleParseError, string> = {
  unrecognized: "无法识别的写法",
  unclosed_brace: "缺少右花括号",
  unclosed_bracket: "缺少右括号",
  empty_item: "存在空的选项",
  duplicate_option: "选项重复",
  bad_interval: "区间需要写成 [下限,上限]",
  bad_bound: "区间边界无法识别",
  mixed_bound_types: "区间两端的类型不一致",
  unit_mismatch: "单位不一致",
  no_bound: "区间至少需要一个边界",
  lo_gt_hi: "下限不能大于上限",
  empty_range: "区间内没有可取的值",
  bad_step: "步长必须是大于 0 的数",
  step_on_date: "日期区间不支持步长",
};

export const ruleParseErrorText = (error: TRuleParseError) => PARSE_ERROR_TEXT[error];

const withUnit = (value: string, unit: string) => (unit ? `${value}${/^[%‰°℃℉]/.test(unit) ? "" : " "}${unit}` : value);

/** 区间的原样写法，报错时回显给填写人：(0,15]、[0.1%,2%] */
export const intervalNotation = (interval: TRuleInterval) => {
  const bound = (value: string | null, fallback: string) => (value === null ? fallback : `${value}${interval.unit}`);
  const body = `${interval.lo_inclusive ? "[" : "("}${bound(interval.lo, "-∞")},${bound(interval.hi, "+∞")}${
    interval.hi_inclusive ? "]" : ")"
  }`;
  return interval.step ? `${body}/${interval.step}` : body;
};

/** 区间的口语化范围，用作输入框的提示：1 – 30、大于 0，至多 15 */
export const intervalRangeText = (interval: TRuleInterval) => {
  const { lo, hi, unit } = interval;
  if (interval.type === "date") {
    if (lo !== null && hi !== null && interval.lo_inclusive && interval.hi_inclusive) return `${lo} 至 ${hi}`;
    const parts: string[] = [];
    if (lo !== null) parts.push(interval.lo_inclusive ? `不早于 ${lo}` : `晚于 ${lo}`);
    if (hi !== null) parts.push(interval.hi_inclusive ? `不晚于 ${hi}` : `早于 ${hi}`);
    return parts.join("，");
  }
  if (lo !== null && hi !== null && interval.lo_inclusive && interval.hi_inclusive) return withUnit(`${lo} – ${hi}`, unit);
  const parts: string[] = [];
  if (lo !== null) parts.push(`${interval.lo_inclusive ? "至少" : "大于"} ${withUnit(lo, unit)}`);
  if (hi !== null) parts.push(`${interval.hi_inclusive ? "至多" : "小于"} ${withUnit(hi, unit)}`);
  return parts.join("，");
};

/** 识别结果里的一条区间说明：1 – 28 的整数、0.1 – 2%，最多 1 位小数，步长 5 */
export const intervalSummary = (interval: TRuleInterval) => {
  const range = intervalRangeText(interval);
  if (interval.type === "date") return range;
  const precision = interval.decimals === 0 ? " 的整数" : `，最多 ${interval.decimals} 位小数`;
  return `${range}${precision}${interval.step ? `，步长 ${interval.step}` : ""}`;
};

export const ruleValueErrorText = (error: TRuleValueError, rule: TRuleDefinition) => {
  const interval = rule.intervals[0];
  switch (error) {
    case "out_of_range":
      return interval ? `超出取值范围 ${intervalNotation(interval)}` : "超出取值范围";
    case "not_number":
      return "请填写数值";
    case "too_many_decimals":
      return interval && interval.decimals > 0 ? `最多保留 ${interval.decimals} 位小数` : "只能填写整数";
    case "step_mismatch":
      return interval?.step ? `不符合步长 ${interval.step}` : "不符合步长";
    case "invalid_date":
      return "日期格式应为 YYYY-MM-DD";
    case "not_in_options":
      return "不在可选项内";
    case "duplicate":
      return "取值不能重复";
    default:
      return "取值格式不正确";
  }
};

/** 输入框里「可以填什么」的一句提示，如「1 – 28 的整数」；多段区间用顿号连起来 */
export const ruleEntryHint = (rule: TRuleDefinition) => rule.intervals.map(intervalSummary).join("、");

/** 一个已存的取值按当前规则是否合法；规则缺失时不判（由调用方单独提示） */
export const ruleValueIssue = (resolved: TResolvedRule, value: TRequirementValue | undefined): string | null => {
  if (resolved.state !== "ready" || resolved.rule.rich) return null;
  for (const entry of ruleValueEntries(value)) {
    const result = checkRuleEntry(resolved.rule, resolved.allowCustom, entry.trim());
    if (!result.ok) return ruleValueErrorText(result.error, resolved.rule);
  }
  return null;
};

/** 规则写法速查，编辑规则的浮层里列出 */
export const RULE_SYNTAX_EXAMPLES: Array<{ expr: string; meaning: string }> = [
  { expr: "{A,B,C}", meaning: "选择" },
  { expr: "[1,30]", meaning: "区间，含两端" },
  { expr: "(0,15]", meaning: "不含左端" },
  { expr: "{[1,15],Yes}", meaning: "区间或选项" },
  { expr: "[0.1%,2%]", meaning: "百分比或单位" },
  { expr: "[0,100]/5", meaning: "按步长取值" },
  { expr: "[2026-01-01,2026-12-31]", meaning: "日期" },
  { expr: "富文本", meaning: "自由填写" },
];
