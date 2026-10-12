import type {
  TFilterConditionNodeForDisplay,
  TFilterValue,
  TProject,
  TProjectFilterProperty,
  TSupportedOperators,
} from "@plane/types";
import {
  COLLECTION_OPERATOR,
  COMPARISON_OPERATOR,
  EQUALITY_OPERATOR,
  EXTENDED_COLLECTION_OPERATOR,
  EXTENDED_COMPARISON_OPERATOR,
  EXTENDED_EQUALITY_OPERATOR,
} from "@plane/types";
import { renderFormattedPayloadDate, toFilterArray } from "@plane/utils";
import { PROJECT_FILTER_ME, PROJECT_FILTER_NONE } from "./types";

export type TProjectFilterCondition = TFilterConditionNodeForDisplay<TProjectFilterProperty, TFilterValue>;

const asStrings = (value: unknown): string[] => {
  const values = toFilterArray(value as never) ?? [];
  return values
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const isNegated = (operator: TSupportedOperators) =>
  operator === EXTENDED_EQUALITY_OPERATOR.NOT_EXACT || operator === EXTENDED_COLLECTION_OPERATOR.NOT_IN;

/** 单值字段（状态 / 类型 / BU / 研发模式 / 可见性…）：空值按「未设置」参与匹配 */
const matchOption = (candidate: string | null | undefined, operator: TSupportedOperators, selected: string[]) => {
  const hit = new Set(selected).has(candidate || PROJECT_FILTER_NONE);
  return isNegated(operator) ? !hit : hit;
};

/**
 * 日期统一比 `YYYY-MM-DD` 字符串。`created_at` 是带时区的 ISO 串，先按本地日期归一；
 * 没填日期的项目，任何日期条件都不命中。
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

const matchCondition = (project: TProject, condition: TProjectFilterCondition, currentUserId: string | undefined) => {
  const selected = asStrings(condition.value);
  // 刚加上、还没选值的条件不参与筛选
  if (selected.length === 0) return true;

  // 人员字段：「我」换成当前用户；成员是名单，「是」= 名单里有任意一个所选的人
  const people = (ids: (string | null | undefined)[]) => {
    const wanted = new Set(selected.map((value) => (value === PROJECT_FILTER_ME ? (currentUserId ?? value) : value)));
    const present = ids.filter((id): id is string => Boolean(id));
    const hasAny = (present.length > 0 ? present : [PROJECT_FILTER_NONE]).some((id) => wanted.has(id));
    return isNegated(condition.operator) ? !hasAny : hasAny;
  };

  switch (condition.property) {
    case "status":
      return matchOption(project.status, condition.operator, selected);
    case "project_type":
      return matchOption(project.project_type, condition.operator, selected);
    case "business_unit":
      return matchOption(project.business_unit, condition.operator, selected);
    case "product_type":
      return matchOption(project.product_type, condition.operator, selected);
    case "dev_mode":
      return matchOption(project.dev_mode, condition.operator, selected);
    case "network":
      return matchOption(project.network === undefined ? undefined : String(project.network), condition.operator, selected);
    case "lead":
      return people([typeof project.project_lead === "string" ? project.project_lead : project.project_lead?.id]);
    case "product_manager":
      return people([project.product_manager]);
    case "members":
      return people(project.members ?? []);
    case "start_date":
      return matchDate(project.start_date, condition.operator, selected);
    case "end_date":
      return matchDate(project.end_date, condition.operator, selected);
    case "created_at":
      return matchDate(project.created_at, condition.operator, selected);
    default:
      return true;
  }
};

/** 筛选行里的条件全部是 AND */
export const projectMatchesConditions = (
  project: TProject,
  conditions: TProjectFilterCondition[],
  currentUserId: string | undefined
) => conditions.every((condition) => matchCondition(project, condition, currentUserId));

/** 条件里有没有用到只在 details 接口才返回的字段（目前只有成员名单） */
export const projectConditionsNeedDetails = (conditions: TProjectFilterCondition[]) =>
  conditions.some((condition) => condition.property === "members" && asStrings(condition.value).length > 0);
