import type { CompleteOrEmpty, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

/** 产品列表富筛选可用的属性；值的匹配规则见 `match-product.ts` */
export type TProductFilterProperty =
  | "code"
  | "stage"
  | "category"
  | "status"
  | "hardware_level"
  | "structure_level"
  | "software_level"
  | "owner"
  | "project_lead"
  | "test_lead"
  | "reviewers"
  | "network"
  | "model_number"
  | "external_model"
  | "start_date"
  | "o_phase_close_date"
  | "v_phase_close_date"
  | "created_at"
  | "updated_at";

export const PRODUCT_FILTER_PROPERTY_KEYS = [
  "code",
  "stage",
  "category",
  "status",
  "hardware_level",
  "structure_level",
  "software_level",
  "owner",
  "project_lead",
  "test_lead",
  "reviewers",
  "network",
  "model_number",
  "external_model",
  "start_date",
  "o_phase_close_date",
  "v_phase_close_date",
  "created_at",
  "updated_at",
] as const satisfies readonly TProductFilterProperty[];

/** 负责人 / 项目负责人 / 测试负责人 / 评审人 选值里的「我」：存成占位值，匹配时换成当前用户 */
export const PRODUCT_FILTER_ME = "__me__";
/** 「未设置」：字段为空的那一类（迁移前的存量产品字典字段 / 负责人多数是空的） */
export const PRODUCT_FILTER_NONE = "__none__";

export type TProductFilterConditionKey = `${TProductFilterProperty}__${TSupportedOperators}`;

export type TProductFilterConditionData = Partial<{
  [K in TProductFilterConditionKey]: string | boolean | number;
}>;

export type TProductFilterAndGroup = {
  [LOGICAL_OPERATOR.AND]: TProductFilterExpressionData[];
};

export type TProductFilterExpressionData = TProductFilterConditionData | TProductFilterAndGroup;

/** localStorage 里存的扁平结构，如 `{ "and": [{ "status__in": "id1,id2" }, { "start_date__lt": "2026-10-12" }] }` */
export type TProductFilterExpression = CompleteOrEmpty<TProductFilterExpressionData>;
