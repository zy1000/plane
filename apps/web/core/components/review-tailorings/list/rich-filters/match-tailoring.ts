import type { TFilterConditionNodeForDisplay, TFilterValue, TReviewTailoring, TSupportedOperators } from "@plane/types";
import { COMPARISON_OPERATOR, EXTENDED_COLLECTION_OPERATOR, EXTENDED_EQUALITY_OPERATOR } from "@plane/types";
import { toFilterArray } from "@plane/utils";
import type { TTailoringFilterProperty } from "./types";
import { TAILORING_FILTER_ME } from "./types";

export type TTailoringCondition = TFilterConditionNodeForDisplay<TTailoringFilterProperty, TFilterValue>;

const asStrings = (value: unknown): string[] =>
  (toFilterArray(value as never) ?? [])
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const matchOption = (candidate: string, operator: TSupportedOperators, selected: string[]) => {
  const isNegative =
    operator === EXTENDED_EQUALITY_OPERATOR.NOT_EXACT || operator === EXTENDED_COLLECTION_OPERATOR.NOT_IN;
  return selected.includes(candidate) !== isNegative;
};

/** 日期比 `YYYY-MM-DD`；时间戳先按本地时区换成日期，避免 UTC 跨天 */
const matchDate = (value: string | null, operator: TSupportedOperators, selected: string[]) => {
  if (!value) return false;
  const date = new Date(value);
  const candidate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const [start, end] = selected.map((item) => item.slice(0, 10));
  if (operator === COMPARISON_OPERATOR.RANGE) {
    if (start && candidate < start) return false;
    if (end && candidate > end) return false;
    return true;
  }
  return start ? candidate === start : true;
};

const matchCondition = (
  tailoring: TReviewTailoring,
  condition: TTailoringCondition,
  currentUserId: string | undefined
) => {
  const selected = asStrings(condition.value);
  // 刚加上、还没选值的条件不参与筛选
  if (selected.length === 0) return true;

  switch (condition.property) {
    case "title":
      return tailoring.title.toLowerCase().includes(selected.join(",").toLowerCase());
    case "status":
      return matchOption(tailoring.status, condition.operator, selected);
    case "tailoring_kind":
      return matchOption(tailoring.tailoring_kind, condition.operator, selected);
    case "created_by":
      return matchOption(
        tailoring.created_by_detail?.id ?? "",
        condition.operator,
        selected.map((value) => (value === TAILORING_FILTER_ME ? (currentUserId ?? value) : value))
      );
    case "created_at":
      return matchDate(tailoring.created_at, condition.operator, selected);
    case "updated_at":
      return matchDate(tailoring.updated_at, condition.operator, selected);
    default:
      return true;
  }
};

/** 筛选行里的条件全部是 AND */
export const tailoringMatchesConditions = (
  tailoring: TReviewTailoring,
  conditions: TTailoringCondition[],
  currentUserId: string | undefined
) => conditions.every((condition) => matchCondition(tailoring, condition, currentUserId));
