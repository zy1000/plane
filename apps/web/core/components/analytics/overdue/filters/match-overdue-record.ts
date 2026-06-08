/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  TFilterValue,
  TFilterConditionNodeForDisplay,
  TOverdueAnalyticsStatus,
  TOverdueDateField,
  TOverdueEntityType,
  TOverdueRecord,
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
import { toFilterArray } from "@plane/utils";
import type { TOverdueFilterProperty } from "./types";

type TOverdueCondition = TFilterConditionNodeForDisplay<TOverdueFilterProperty, TFilterValue>;

const SUPPORTED_STATUS_VALUES: TOverdueAnalyticsStatus[] = ["active", "resolved"];
const SUPPORTED_ENTITY_TYPE_VALUES: TOverdueEntityType[] = ["issue", "cycle", "release", "test_plan"];

export type TOverdueExportOptions = {
  dateField?: TOverdueDateField;
  endDate?: string;
  entityType?: TOverdueEntityType;
  projectIds?: string[];
  startDate?: string;
  status?: TOverdueAnalyticsStatus;
};

const asStringArray = (value: unknown): string[] => {
  const values = toFilterArray(value as never) ?? [];
  if (values.length === 1 && typeof values[0] === "string" && values[0].includes(",")) {
    return values[0]
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return values
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
};

const hasConditionValue = (value: unknown): boolean => asStringArray(value).length > 0;

const normalizeDateString = (value: string | null | undefined): string | null => (value ? value.slice(0, 10) : null);

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getRangeBounds = (value: unknown): { end: string | null; start: string | null } => {
  const values = asStringArray(value);
  return {
    start: values[0] ?? null,
    end: values[1] ?? null,
  };
};

const evaluateSingleValueOperator = (
  candidate: string | null,
  operator: TSupportedOperators,
  selectedValues: string[]
): boolean => {
  if (selectedValues.length === 0) return true;

  const selectedSet = new Set(selectedValues);
  switch (operator) {
    case EQUALITY_OPERATOR.EXACT:
    case COLLECTION_OPERATOR.IN:
      return candidate !== null ? selectedSet.has(candidate) : false;
    case EXTENDED_EQUALITY_OPERATOR.NOT_EXACT:
    case EXTENDED_COLLECTION_OPERATOR.NOT_IN:
      return candidate !== null ? !selectedSet.has(candidate) : true;
    default:
      return true;
  }
};

const evaluateAssigneeOperator = (
  assigneeIds: string[],
  operator: TSupportedOperators,
  selectedValues: string[]
): boolean => {
  if (selectedValues.length === 0) return true;

  const selectedSet = new Set(selectedValues);
  switch (operator) {
    case EQUALITY_OPERATOR.EXACT:
    case COLLECTION_OPERATOR.IN:
      return assigneeIds.some((id) => selectedSet.has(id));
    case EXTENDED_EQUALITY_OPERATOR.NOT_EXACT:
    case EXTENDED_COLLECTION_OPERATOR.NOT_IN:
      return assigneeIds.every((id) => !selectedSet.has(id));
    default:
      return true;
  }
};

const evaluateNumberOperator = (rawValue: number, operator: TSupportedOperators, selectedValue: unknown): boolean => {
  const values = asStringArray(selectedValue);
  const left = parseNumber(values[0]);
  const right = parseNumber(values[1]);

  switch (operator) {
    case EQUALITY_OPERATOR.EXACT:
      return left === null ? true : rawValue === left;
    case COMPARISON_OPERATOR.RANGE:
      if (left !== null && rawValue < left) return false;
      if (right !== null && rawValue > right) return false;
      return true;
    case EXTENDED_COMPARISON_OPERATOR.NOT_RANGE:
      return !evaluateNumberOperator(rawValue, COMPARISON_OPERATOR.RANGE, selectedValue);
    case EXTENDED_COMPARISON_OPERATOR.LT:
      return left === null ? true : rawValue < left;
    case EXTENDED_COMPARISON_OPERATOR.NOT_LT:
      return left === null ? true : rawValue >= left;
    case EXTENDED_COMPARISON_OPERATOR.LTE:
      return left === null ? true : rawValue <= left;
    case EXTENDED_COMPARISON_OPERATOR.NOT_LTE:
      return left === null ? true : rawValue > left;
    case EXTENDED_COMPARISON_OPERATOR.GT:
      return left === null ? true : rawValue > left;
    case EXTENDED_COMPARISON_OPERATOR.NOT_GT:
      return left === null ? true : rawValue <= left;
    case EXTENDED_COMPARISON_OPERATOR.GTE:
      return left === null ? true : rawValue >= left;
    case EXTENDED_COMPARISON_OPERATOR.NOT_GTE:
      return left === null ? true : rawValue < left;
    default:
      return true;
  }
};

const evaluateDateOperator = (
  rawValue: string | null,
  operator: TSupportedOperators,
  selectedValue: unknown
): boolean => {
  const candidate = normalizeDateString(rawValue);
  if (!candidate) return false;

  const { start, end } = getRangeBounds(selectedValue);
  switch (operator) {
    case EQUALITY_OPERATOR.EXACT:
      return start ? candidate === start : true;
    case COMPARISON_OPERATOR.RANGE:
      if (start && candidate < start) return false;
      if (end && candidate > end) return false;
      return true;
    case EXTENDED_COMPARISON_OPERATOR.NOT_RANGE:
      return !evaluateDateOperator(rawValue, COMPARISON_OPERATOR.RANGE, selectedValue);
    case EXTENDED_COMPARISON_OPERATOR.LT:
      return start ? candidate < start : true;
    case EXTENDED_COMPARISON_OPERATOR.NOT_LT:
      return start ? candidate >= start : true;
    case EXTENDED_COMPARISON_OPERATOR.LTE:
      return start ? candidate <= start : true;
    case EXTENDED_COMPARISON_OPERATOR.NOT_LTE:
      return start ? candidate > start : true;
    case EXTENDED_COMPARISON_OPERATOR.GT:
      return start ? candidate > start : true;
    case EXTENDED_COMPARISON_OPERATOR.NOT_GT:
      return start ? candidate <= start : true;
    case EXTENDED_COMPARISON_OPERATOR.GTE:
      return start ? candidate >= start : true;
    case EXTENDED_COMPARISON_OPERATOR.NOT_GTE:
      return start ? candidate < start : true;
    default:
      return true;
  }
};

const matchesCondition = (record: TOverdueRecord, condition: TOverdueCondition): boolean => {
  if (!hasConditionValue(condition.value)) return true;

  switch (condition.property) {
    case "entity_type":
      return evaluateSingleValueOperator(record.entity_type, condition.operator, asStringArray(condition.value));
    case "status": {
      const statusValue: TOverdueAnalyticsStatus = record.is_active ? "active" : "resolved";
      return evaluateSingleValueOperator(statusValue, condition.operator, asStringArray(condition.value));
    }
    case "project_id":
      return evaluateSingleValueOperator(record.project_id, condition.operator, asStringArray(condition.value));
    case "assignee_id":
      return evaluateAssigneeOperator(
        record.assignees.map((assignee) => assignee.id),
        condition.operator,
        asStringArray(condition.value)
      );
    case "overdue_days":
      return evaluateNumberOperator(record.overdue_days, condition.operator, condition.value);
    case "deadline":
      return evaluateDateOperator(record.deadline, condition.operator, condition.value);
    case "overdue_since":
      return evaluateDateOperator(record.overdue_since, condition.operator, condition.value);
    default:
      return true;
  }
};

const getPropertyConditions = (
  conditions: TOverdueCondition[],
  property: TOverdueFilterProperty
): TOverdueCondition[] => conditions.filter((condition) => condition.property === property && hasConditionValue(condition.value));

const resolveSingleValue = <T extends string>(
  conditions: TOverdueCondition[],
  property: TOverdueFilterProperty,
  allowedValues: T[]
): T | undefined => {
  const relevantConditions = getPropertyConditions(conditions, property);
  if (relevantConditions.length === 0) return undefined;

  let candidateSet = new Set(allowedValues);
  for (const condition of relevantConditions) {
    const values = new Set(asStringArray(condition.value).filter((value): value is T => allowedValues.includes(value as T)));
    if (values.size === 0) continue;

    if (condition.operator === EQUALITY_OPERATOR.EXACT || condition.operator === COLLECTION_OPERATOR.IN) {
      candidateSet = new Set(Array.from(candidateSet).filter((value) => values.has(value)));
      continue;
    }

    return undefined;
  }

  return candidateSet.size === 1 ? Array.from(candidateSet)[0] : undefined;
};

const resolveProjectIds = (conditions: TOverdueCondition[]): string[] | undefined => {
  const projectConditions = getPropertyConditions(conditions, "project_id");
  if (projectConditions.length === 0) return undefined;

  let candidateSet: Set<string> | undefined;
  for (const condition of projectConditions) {
    const values = new Set(asStringArray(condition.value));
    if (values.size === 0) continue;

    if (condition.operator !== EQUALITY_OPERATOR.EXACT && condition.operator !== COLLECTION_OPERATOR.IN) {
      return undefined;
    }

    candidateSet =
      candidateSet === undefined
        ? values
        : new Set(Array.from(candidateSet).filter((existingValue) => values.has(existingValue)));
  }

  if (!candidateSet || candidateSet.size === 0) return undefined;
  return Array.from(candidateSet);
};

const resolveDateExport = (
  conditions: TOverdueCondition[]
): Pick<TOverdueExportOptions, "dateField" | "endDate" | "startDate"> => {
  const deadlineConditions = getPropertyConditions(conditions, "deadline");
  const overdueSinceConditions = getPropertyConditions(conditions, "overdue_since");

  if (deadlineConditions.length > 0 && overdueSinceConditions.length > 0) {
    return {};
  }

  const dateField: TOverdueDateField | undefined =
    deadlineConditions.length > 0 ? "deadline" : overdueSinceConditions.length > 0 ? "overdue_since" : undefined;
  if (!dateField) return {};

  const targetConditions = dateField === "deadline" ? deadlineConditions : overdueSinceConditions;

  let startDate: string | undefined;
  let endDate: string | undefined;
  for (const condition of targetConditions) {
    const { start, end } = getRangeBounds(condition.value);

    if (condition.operator === EQUALITY_OPERATOR.EXACT) {
      const exactDate = start;
      if (!exactDate) continue;
      startDate = startDate ? (startDate > exactDate ? startDate : exactDate) : exactDate;
      endDate = endDate ? (endDate < exactDate ? endDate : exactDate) : exactDate;
      continue;
    }

    if (condition.operator === COMPARISON_OPERATOR.RANGE) {
      if (start) startDate = startDate ? (startDate > start ? startDate : start) : start;
      if (end) endDate = endDate ? (endDate < end ? endDate : end) : end;
      continue;
    }

    return {};
  }

  if (!startDate && !endDate) return {};
  if (startDate && endDate && startDate > endDate) return {};

  return {
    dateField,
    startDate,
    endDate,
  };
};

export const recordMatchesConditions = (record: TOverdueRecord, conditions: TOverdueCondition[]): boolean => {
  if (conditions.length === 0) return true;
  return conditions.every((condition) => matchesCondition(record, condition));
};

export const buildExportParamsFromConditions = (conditions: TOverdueCondition[]): TOverdueExportOptions => {
  const status = resolveSingleValue(conditions, "status", SUPPORTED_STATUS_VALUES);
  const entityType = resolveSingleValue(conditions, "entity_type", SUPPORTED_ENTITY_TYPE_VALUES);
  const projectIds = resolveProjectIds(conditions);
  const dateParams = resolveDateExport(conditions);

  return {
    ...(status ? { status } : {}),
    ...(entityType ? { entityType } : {}),
    ...(projectIds ? { projectIds } : {}),
    ...dateParams,
  };
};
