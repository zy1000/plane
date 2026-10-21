import type { CompleteOrEmpty, TProjectFilterProperty, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

export const PROJECT_FILTER_PROPERTY_KEYS = [
  "status",
  "project_type",
  "business_unit",
  "business_category",
  "dev_mode",
  "lead",
  "product_manager",
  "members",
  "network",
  "start_date",
  "end_date",
  "created_at",
] as const satisfies readonly TProjectFilterProperty[];

/** 负责人 / 研发产品经理 / 成员 选值里的「我」：存成占位值，匹配时换成当前用户 */
export const PROJECT_FILTER_ME = "__me__";
/** 「未设置」：字段为空的那一类（存量项目的状态 / 类型 / BU 多数是空的） */
export const PROJECT_FILTER_NONE = "__none__";

export type TProjectFilterConditionKey = `${TProjectFilterProperty}__${TSupportedOperators}`;

export type TProjectFilterConditionData = Partial<{
  [K in TProjectFilterConditionKey]: string | boolean | number;
}>;

export type TProjectFilterAndGroup = {
  [LOGICAL_OPERATOR.AND]: TProjectFilterExpressionData[];
};

export type TProjectFilterExpressionData = TProjectFilterConditionData | TProjectFilterAndGroup;

/** localStorage 里存的扁平结构，如 `{ "and": [{ "status__in": "id1,id2" }, { "end_date__lt": "2026-10-12" }] }` */
export type TProjectFilterExpression = CompleteOrEmpty<TProjectFilterExpressionData>;
