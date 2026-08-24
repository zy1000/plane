import type { CompleteOrEmpty, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

export const PROJECT_REQUIREMENT_FILTER_PROPERTY_KEYS = [
  "title",
  "status",
  "approval",
  "priority",
  "assignee",
  "start_date",
  "target_date",
  "requirement_type",
] as const;

export type TProjectRequirementFilterProperty = (typeof PROJECT_REQUIREMENT_FILTER_PROPERTY_KEYS)[number];

export type TProjectRequirementFilterConditionKey = `${TProjectRequirementFilterProperty}__${TSupportedOperators}`;

export type TProjectRequirementFilterConditionData = Partial<{
  [K in TProjectRequirementFilterConditionKey]: string | boolean | number;
}>;

export type TProjectRequirementFilterAndGroup = {
  [LOGICAL_OPERATOR.AND]: TProjectRequirementFilterExpressionData[];
};

export type TProjectRequirementFilterExpressionData =
  | TProjectRequirementFilterConditionData
  | TProjectRequirementFilterAndGroup;

export type TProjectRequirementFilterExpression = CompleteOrEmpty<TProjectRequirementFilterExpressionData>;

/** 映射到项目需求 list 的专用 query。多值已经收成逗号分隔。 */
export type TProjectRequirementListQuery = {
  title?: string;
  status?: string;
  requirementTypeId?: string;
  approvalState?: string;
  priority?: string;
  assigneeId?: string;
  startDate?: string;
  startDateFrom?: string;
  startDateTo?: string;
  targetDate?: string;
  targetDateFrom?: string;
  targetDateTo?: string;
};
