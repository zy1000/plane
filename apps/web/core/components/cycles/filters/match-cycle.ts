import type { ICycle, TFilterConditionNodeForDisplay, TFilterValue, TSupportedOperators } from "@plane/types";
import {
  COMPARISON_OPERATOR,
  EQUALITY_OPERATOR,
  EXTENDED_COLLECTION_OPERATOR,
  EXTENDED_COMPARISON_OPERATOR,
  EXTENDED_EQUALITY_OPERATOR,
} from "@plane/types";
import { toFilterArray } from "@plane/utils";
import type { TCycleFilterProperty } from "./types";
import { CYCLE_FILTER_NONE } from "./types";

export type TCycleFilterCondition = TFilterConditionNodeForDisplay<TCycleFilterProperty, TFilterValue>;

const asStrings = (value: unknown): string[] => {
  const values = toFilterArray(value as never) ?? [];
  return values
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const isNegated = (operator: TSupportedOperators) =>
  operator === EXTENDED_EQUALITY_OPERATOR.NOT_EXACT || operator === EXTENDED_COLLECTION_OPERATOR.NOT_IN;

/** 单值字段（状态 / 阶段）：空值按「无」参与匹配 */
const matchOption = (candidate: string | null | undefined, operator: TSupportedOperators, selected: string[]) => {
  const hit = new Set(selected).has(candidate || CYCLE_FILTER_NONE);
  return isNegated(operator) ? !hit : hit;
};

/** 日期统一比 `YYYY-MM-DD` 字符串；没填日期的迭代，任何日期条件都不命中 */
const matchDate = (value: string | null | undefined, operator: TSupportedOperators, selected: string[]) => {
  if (!value) return false;
  const candidate = value.slice(0, 10);
  const [start, end] = selected.map((item) => item.slice(0, 10));
  switch (operator) {
    case COMPARISON_OPERATOR.RANGE:
      if (start && candidate < start) return false;
      if (end && candidate > end) return false;
      return true;
    case EXTENDED_COMPARISON_OPERATOR.LT:
      return start ? candidate < start : true;
    case EXTENDED_COMPARISON_OPERATOR.GT:
      return start ? candidate > start : true;
    case EQUALITY_OPERATOR.EXACT:
    default:
      return start ? candidate === start : true;
  }
};

const matchCondition = (cycle: ICycle, condition: TCycleFilterCondition) => {
  const selected = asStrings(condition.value);
  // 刚加上、还没选值的条件不参与筛选
  if (selected.length === 0) return true;

  switch (condition.property) {
    case "status":
      return matchOption(cycle.status, condition.operator, selected);
    case "stage":
      return matchOption(cycle.stage_id, condition.operator, selected);
    case "start_date":
      return matchDate(cycle.start_date, condition.operator, selected);
    case "end_date":
      return matchDate(cycle.end_date, condition.operator, selected);
    default:
      return true;
  }
};

/** 筛选行里的条件全部是 AND */
export const cycleMatchesConditions = (cycle: ICycle, conditions: TCycleFilterCondition[]) =>
  conditions.every((condition) => matchCondition(cycle, condition));
