import type { CompleteOrEmpty, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

export const RISK_FILTER_PROPERTY_KEYS = [
  "status",
  "category",
  "risk_level",
  "impact_level",
  "probability",
  "strategy",
  "owner_id",
  "proposer_id",
  "proposed_date",
  "planned_handle_date",
] as const;

export type TRiskFilterProperty = (typeof RISK_FILTER_PROPERTY_KEYS)[number];

/** 责任人 / 提出人选值里的「我」：存成占位值，匹配时换成当前用户 */
export const RISK_FILTER_ME = "__me__";
/** 「未指定」「未填」：字段为空的那一类 */
export const RISK_FILTER_NONE = "__none__";

export type TRiskFilterConditionKey = `${TRiskFilterProperty}__${TSupportedOperators}`;

export type TRiskFilterConditionData = Partial<{
  [K in TRiskFilterConditionKey]: string | boolean | number;
}>;

export type TRiskFilterAndGroup = {
  [LOGICAL_OPERATOR.AND]: TRiskFilterExpressionData[];
};

export type TRiskFilterExpressionData = TRiskFilterConditionData | TRiskFilterAndGroup;

export type TRiskFilterExpression = CompleteOrEmpty<TRiskFilterExpressionData>;
