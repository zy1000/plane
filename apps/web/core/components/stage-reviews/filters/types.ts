import type { CompleteOrEmpty, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

export const STAGE_REVIEW_FILTER_PROPERTY_KEYS = [
  "title",
  "status",
  "result",
  "leader_id",
  "auditor_id",
  "product_id",
  "project_id",
  "kind",
  "start_date",
  "end_date",
] as const;

export type TStageReviewFilterProperty = (typeof STAGE_REVIEW_FILTER_PROPERTY_KEYS)[number];

/** 负责人 / 审核者选值里的「我」：存成占位值，匹配时换成当前用户 */
export const STAGE_REVIEW_FILTER_ME = "__me__";
/** 「未指定」「暂无结论」：字段为空的那一类 */
export const STAGE_REVIEW_FILTER_NONE = "__none__";

export type TStageReviewFilterConditionKey = `${TStageReviewFilterProperty}__${TSupportedOperators}`;

export type TStageReviewFilterConditionData = Partial<{
  [K in TStageReviewFilterConditionKey]: string | boolean | number;
}>;

export type TStageReviewFilterAndGroup = {
  [LOGICAL_OPERATOR.AND]: TStageReviewFilterExpressionData[];
};

export type TStageReviewFilterExpressionData = TStageReviewFilterConditionData | TStageReviewFilterAndGroup;

export type TStageReviewFilterExpression = CompleteOrEmpty<TStageReviewFilterExpressionData>;
