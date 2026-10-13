import type { TFilterConditionNodeForDisplay, TFilterValue, TRisk, TSupportedOperators } from "@plane/types";
import {
  COLLECTION_OPERATOR,
  COMPARISON_OPERATOR,
  EQUALITY_OPERATOR,
  EXTENDED_COLLECTION_OPERATOR,
  EXTENDED_EQUALITY_OPERATOR,
} from "@plane/types";
import { toFilterArray } from "@plane/utils";
import type { TRiskFilterProperty } from "./types";
import { RISK_FILTER_ME, RISK_FILTER_NONE } from "./types";

export type TRiskCondition = TFilterConditionNodeForDisplay<TRiskFilterProperty, TFilterValue>;

const asStrings = (value: unknown): string[] => {
  const values = toFilterArray(value as never) ?? [];
  return values
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const isNegated = (operator: TSupportedOperators) =>
  operator === EXTENDED_EQUALITY_OPERATOR.NOT_EXACT || operator === EXTENDED_COLLECTION_OPERATOR.NOT_IN;

const matchOption = (candidate: string, operator: TSupportedOperators, selected: string[]) => {
  const selectedSet = new Set(selected);
  switch (operator) {
    case EXTENDED_EQUALITY_OPERATOR.NOT_EXACT:
    case EXTENDED_COLLECTION_OPERATOR.NOT_IN:
      return !selectedSet.has(candidate);
    case EQUALITY_OPERATOR.EXACT:
    case COLLECTION_OPERATOR.IN:
    default:
      return selectedSet.has(candidate);
  }
};

/** 日期统一比 `YYYY-MM-DD` 字符串；没填日期的，任何日期条件都不命中 */
const matchDate = (value: string | null, operator: TSupportedOperators, selected: string[]) => {
  if (!value) return false;
  const candidate = value.slice(0, 10);
  const [start, end] = selected.map((item) => item.slice(0, 10));
  if (operator === COMPARISON_OPERATOR.RANGE) {
    if (start && candidate < start) return false;
    if (end && candidate > end) return false;
    return true;
  }
  return start ? candidate === start : true;
};

const matchCondition = (risk: TRisk, condition: TRiskCondition, currentUserId: string | undefined) => {
  const selected = asStrings(condition.value);
  // 刚加上、还没选值的条件不参与筛选
  if (selected.length === 0) return true;

  // 责任人 / 提出人是单个人：「我」换成当前用户，没人按「未指定」算
  const person = (id: string | null) => {
    const wanted = new Set(selected.map((value) => (value === RISK_FILTER_ME ? (currentUserId ?? value) : value)));
    const hit = wanted.has(id ?? RISK_FILTER_NONE);
    return isNegated(condition.operator) ? !hit : hit;
  };

  switch (condition.property) {
    case "status":
      return matchOption(risk.status, condition.operator, selected);
    case "category":
      return matchOption(risk.category || RISK_FILTER_NONE, condition.operator, selected);
    case "risk_level":
      return matchOption(risk.risk_level, condition.operator, selected);
    case "impact_level":
      return matchOption(String(risk.impact_level), condition.operator, selected);
    case "probability":
      return matchOption(String(risk.probability), condition.operator, selected);
    case "strategy":
      return matchOption(risk.strategy || RISK_FILTER_NONE, condition.operator, selected);
    case "owner_id":
      return person(risk.owner);
    case "proposer_id":
      return person(risk.proposer);
    case "proposed_date":
      return matchDate(risk.proposed_date, condition.operator, selected);
    case "planned_handle_date":
      return matchDate(risk.planned_handle_date, condition.operator, selected);
    default:
      return true;
  }
};

/** 筛选行里的条件全部是 AND */
export const riskMatchesConditions = (risk: TRisk, conditions: TRiskCondition[], currentUserId: string | undefined) =>
  conditions.every((condition) => matchCondition(risk, condition, currentUserId));
