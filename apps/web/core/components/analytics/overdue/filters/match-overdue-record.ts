/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  TFilterValue,
  TFilterConditionNodeForDisplay,
  TOverdueAnalyticsStatus,
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

export const recordMatchesConditions = (record: TOverdueRecord, conditions: TOverdueCondition[]): boolean => {
  if (conditions.length === 0) return true;
  return conditions.every((condition) => matchesCondition(record, condition));
};
