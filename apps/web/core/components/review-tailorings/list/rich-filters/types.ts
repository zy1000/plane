import type { CompleteOrEmpty, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

export const TAILORING_FILTER_PROPERTY_KEYS = [
  "title",
  "status",
  "tailoring_kind",
  "created_by",
  "created_at",
  "updated_at",
] as const;

export type TTailoringFilterProperty = (typeof TAILORING_FILTER_PROPERTY_KEYS)[number];

/** 创建人选值里的「我」：存成占位值，匹配时换成当前用户 */
export const TAILORING_FILTER_ME = "__me__";

export type TTailoringFilterConditionKey = `${TTailoringFilterProperty}__${TSupportedOperators}`;

export type TTailoringFilterConditionData = Partial<{
  [K in TTailoringFilterConditionKey]: string | boolean | number;
}>;

export type TTailoringFilterAndGroup = {
  [LOGICAL_OPERATOR.AND]: TTailoringFilterExpressionData[];
};

export type TTailoringFilterExpressionData = TTailoringFilterConditionData | TTailoringFilterAndGroup;

export type TTailoringFilterExpression = CompleteOrEmpty<TTailoringFilterExpressionData>;
