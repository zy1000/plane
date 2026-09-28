import type {
  TFilterConditionNodeForDisplay,
  TFilterValue,
  TStageReview,
  TSupportedOperators,
} from "@plane/types";
import {
  COLLECTION_OPERATOR,
  COMPARISON_OPERATOR,
  EQUALITY_OPERATOR,
  EXTENDED_COLLECTION_OPERATOR,
  EXTENDED_EQUALITY_OPERATOR,
} from "@plane/types";
import { toFilterArray } from "@plane/utils";
import type { TStageReviewFilterProperty } from "./types";
import { STAGE_REVIEW_FILTER_ME, STAGE_REVIEW_FILTER_NONE } from "./types";

export type TStageReviewCondition = TFilterConditionNodeForDisplay<TStageReviewFilterProperty, TFilterValue>;

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

/** 日期统一比 `YYYY-MM-DD` 字符串；评审上没填日期的，任何日期条件都不命中 */
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

const matchCondition = (review: TStageReview, condition: TStageReviewCondition, currentUserId: string | undefined) => {
  const selected = asStrings(condition.value);
  // 刚加上、还没选值的条件不参与筛选
  if (selected.length === 0) return true;

  // 负责人 / 审核者是名单：「是其中之一」= 名单里有任意一个所选的人，「不是」= 一个都没有；
  // 名单为空按「未指定」算
  const people = (ids: string[]) => {
    const wanted = new Set(
      selected.map((value) => (value === STAGE_REVIEW_FILTER_ME ? (currentUserId ?? value) : value))
    );
    const hasAny = (ids.length > 0 ? ids : [STAGE_REVIEW_FILTER_NONE]).some((id) => wanted.has(id));
    return isNegated(condition.operator) ? !hasAny : hasAny;
  };

  switch (condition.property) {
    case "title":
      return review.title.toLowerCase().includes(selected.join(",").toLowerCase());
    case "status":
      return matchOption(review.status, condition.operator, selected);
    case "result":
      return matchOption(review.result || STAGE_REVIEW_FILTER_NONE, condition.operator, selected);
    case "leader_id":
      return people(review.leader_ids);
    case "auditor_id":
      return people(review.auditor_ids);
    case "product_id":
      return matchOption(review.product_id, condition.operator, selected);
    case "project_id":
      return matchOption(review.project_id, condition.operator, selected);
    case "kind":
      return matchOption(review.kind, condition.operator, selected);
    case "start_date":
      return matchDate(review.start_date, condition.operator, selected);
    case "end_date":
      return matchDate(review.end_date, condition.operator, selected);
    default:
      return true;
  }
};

/** 筛选行里的条件全部是 AND */
export const stageReviewMatchesConditions = (
  review: TStageReview,
  conditions: TStageReviewCondition[],
  currentUserId: string | undefined
) => conditions.every((condition) => matchCondition(review, condition, currentUserId));
