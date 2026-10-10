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

/**
 * 筛选行的扁平外部格式（`{ "status__in": "in_review,in_approval" }`），按属性键参数化：
 * 裁剪表列表与详情页各有一套属性，结构完全一样。
 */
export type TFlatFilterConditionData<P extends string> = Partial<{
  [K in `${P}__${TSupportedOperators}`]: string | boolean | number;
}>;

export type TFlatFilterAndGroup<P extends string> = {
  [LOGICAL_OPERATOR.AND]: TFlatFilterExpressionData<P>[];
};

export type TFlatFilterExpressionData<P extends string> = TFlatFilterConditionData<P> | TFlatFilterAndGroup<P>;

export type TFlatFilterExpression<P extends string> = CompleteOrEmpty<TFlatFilterExpressionData<P>>;

export type TTailoringFilterConditionData = TFlatFilterConditionData<TTailoringFilterProperty>;

export type TTailoringFilterExpressionData = TFlatFilterExpressionData<TTailoringFilterProperty>;

export type TTailoringFilterExpression = TFlatFilterExpression<TTailoringFilterProperty>;
