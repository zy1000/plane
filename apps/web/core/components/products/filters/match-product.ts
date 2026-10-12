import type { TFilterConditionNodeForDisplay, TFilterValue, TProduct, TSupportedOperators } from "@plane/types";
import {
  COMPARISON_OPERATOR,
  EQUALITY_OPERATOR,
  EXTENDED_COLLECTION_OPERATOR,
  EXTENDED_COMPARISON_OPERATOR,
  EXTENDED_EQUALITY_OPERATOR,
} from "@plane/types";
import { renderFormattedPayloadDate, toFilterArray } from "@plane/utils";
import type { TProductFilterProperty } from "./types";
import { PRODUCT_FILTER_ME, PRODUCT_FILTER_NONE } from "./types";

export type TProductFilterCondition = TFilterConditionNodeForDisplay<TProductFilterProperty, TFilterValue>;

const asStrings = (value: unknown): string[] => {
  const values = toFilterArray(value as never) ?? [];
  return values
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const isNegated = (operator: TSupportedOperators) =>
  operator === EXTENDED_EQUALITY_OPERATOR.NOT_EXACT || operator === EXTENDED_COLLECTION_OPERATOR.NOT_IN;

/** 单值字段（字典值 / 代号 / 型号 / 可见性…）：空值按「未设置」参与匹配 */
const matchOption = (candidate: string | null | undefined, operator: TSupportedOperators, selected: string[]) => {
  const hit = new Set(selected).has(candidate || PRODUCT_FILTER_NONE);
  return isNegated(operator) ? !hit : hit;
};

/**
 * 日期统一比 `YYYY-MM-DD` 字符串。`created_at` / `updated_at` 是带时区的 ISO 串，先按本地日期归一；
 * 没填日期的产品，任何日期条件都不命中。
 */
const matchDate = (value: string | Date | null | undefined, operator: TSupportedOperators, selected: string[]) => {
  const candidate = value ? renderFormattedPayloadDate(value) : undefined;
  if (!candidate) return false;
  const [start, end] = selected.map((item) => item.slice(0, 10));
  switch (operator) {
    case COMPARISON_OPERATOR.RANGE:
      if (start && candidate < start) return false;
      if (end && candidate > end) return false;
      return true;
    case EXTENDED_COMPARISON_OPERATOR.LT:
      return start ? candidate < start : true;
    case EXTENDED_COMPARISON_OPERATOR.GT:
      return start ? candidate > start : true;
    case EQUALITY_OPERATOR.EXACT:
    default:
      return start ? candidate === start : true;
  }
};

const matchCondition = (product: TProduct, condition: TProductFilterCondition, currentUserId: string | undefined) => {
  const selected = asStrings(condition.value);
  // 刚加上、还没选值的条件不参与筛选
  if (selected.length === 0) return true;

  // 人员字段：「我」换成当前用户；评审人是名单，「是」= 名单里有任意一个所选的人
  const people = (ids: (string | null | undefined)[]) => {
    const wanted = new Set(selected.map((value) => (value === PRODUCT_FILTER_ME ? (currentUserId ?? value) : value)));
    const present = ids.filter((id): id is string => Boolean(id));
    const hasAny = (present.length > 0 ? present : [PRODUCT_FILTER_NONE]).some((id) => wanted.has(id));
    return isNegated(condition.operator) ? !hasAny : hasAny;
  };

  switch (condition.property) {
    case "code":
      return matchOption(product.code, condition.operator, selected);
    case "stage":
      return matchOption(product.stage, condition.operator, selected);
    case "category":
      return matchOption(product.category, condition.operator, selected);
    case "status":
      return matchOption(product.status, condition.operator, selected);
    case "hardware_level":
      return matchOption(product.hardware_level, condition.operator, selected);
    case "structure_level":
      return matchOption(product.structure_level, condition.operator, selected);
    case "software_level":
      return matchOption(product.software_level, condition.operator, selected);
    case "model_number":
      return matchOption(product.model_number, condition.operator, selected);
    case "external_model":
      return matchOption(product.external_model, condition.operator, selected);
    case "network":
      return matchOption(
        product.network === undefined ? undefined : String(product.network),
        condition.operator,
        selected
      );
    case "owner":
      return people([product.owner]);
    case "project_lead":
      return people([product.project_lead]);
    case "test_lead":
      return people([product.test_lead]);
    case "reviewers":
      return people(product.reviewers ?? []);
    case "start_date":
      return matchDate(product.start_date, condition.operator, selected);
    case "o_phase_close_date":
      return matchDate(product.o_phase_close_date, condition.operator, selected);
    case "v_phase_close_date":
      return matchDate(product.v_phase_close_date, condition.operator, selected);
    case "created_at":
      return matchDate(product.created_at, condition.operator, selected);
    case "updated_at":
      return matchDate(product.updated_at, condition.operator, selected);
    default:
      return true;
  }
};

/** 筛选行里的条件全部是 AND */
export const productMatchesConditions = (
  product: TProduct,
  conditions: TProductFilterCondition[],
  currentUserId: string | undefined
) => conditions.every((condition) => matchCondition(product, condition, currentUserId));
