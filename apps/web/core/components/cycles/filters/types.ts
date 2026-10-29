import type { CompleteOrEmpty, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

/** 迭代列表富筛选可用的属性；值的匹配规则见 `match-cycle.ts` */
export type TCycleFilterProperty = "status" | "stage" | "start_date" | "end_date";

export const CYCLE_FILTER_PROPERTY_KEYS = [
  "status",
  "stage",
  "start_date",
  "end_date",
] as const satisfies readonly TCycleFilterProperty[];

/** 「无阶段」：stage_id 为空的那一类 */
export const CYCLE_FILTER_NONE = "__none__";

export type TCycleFilterConditionKey = `${TCycleFilterProperty}__${TSupportedOperators}`;

export type TCycleFilterConditionData = Partial<{
  [K in TCycleFilterConditionKey]: string | boolean | number;
}>;

export type TCycleFilterAndGroup = {
  [LOGICAL_OPERATOR.AND]: TCycleFilterExpressionData[];
};

export type TCycleFilterExpressionData = TCycleFilterConditionData | TCycleFilterAndGroup;

/** localStorage 里存的扁平结构，如 `{ "and": [{ "status__in": "in_progress,testing" }, { "start_date__lt": "2026-10-12" }] }` */
export type TCycleFilterExpression = CompleteOrEmpty<TCycleFilterExpressionData>;
