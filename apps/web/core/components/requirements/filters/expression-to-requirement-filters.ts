import type { TFilterExpression, TFilterValue, TRequirementFilter } from "@plane/types";
import { EQUALITY_OPERATOR, EXTENDED_EQUALITY_OPERATOR } from "@plane/types";
import { createAndGroupNode, createConditionNode, extractConditions, hasValidValue } from "@plane/utils";
import type { TRequirementGridFilterExpression, TRequirementGridFilterProperty } from "./types";

/** 富过滤没有空/非空算子，用 EXACT + 哨兵值映射到后端 is_empty / is_not_empty */
export const REQUIREMENT_EMPTY_FILTER_VALUE = "__empty__";
export const REQUIREMENT_NOT_EMPTY_FILTER_VALUE = "__not_empty__";

const toScalarValue = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

export const getRequirementFiltersFromExpression = (
  expression: TRequirementGridFilterExpression | null | undefined
): TRequirementFilter[] => (Array.isArray(expression?.filters) ? expression.filters : []);

export const internalExpressionToRequirementFilters = (
  expression: TFilterExpression<TRequirementGridFilterProperty> | null
): TRequirementFilter[] => {
  if (!expression) return [];

  const filters: TRequirementFilter[] = [];
  for (const condition of extractConditions(expression)) {
    if (!hasValidValue(condition.value)) continue;

    const value = toScalarValue(condition.value);
    if (condition.operator === EXTENDED_EQUALITY_OPERATOR.CONTAINS) {
      if (value === undefined || value === null || value === "") continue;
      filters.push({ field_id: condition.property, operator: "contains", value });
      continue;
    }

    if (condition.operator !== EQUALITY_OPERATOR.EXACT) continue;

    if (value === REQUIREMENT_EMPTY_FILTER_VALUE) {
      filters.push({ field_id: condition.property, operator: "is_empty" });
      continue;
    }
    if (value === REQUIREMENT_NOT_EMPTY_FILTER_VALUE) {
      filters.push({ field_id: condition.property, operator: "is_not_empty" });
      continue;
    }
    if (value === undefined || value === null || value === "") continue;
    filters.push({ field_id: condition.property, operator: "equals", value });
  }
  return filters;
};

const requirementFilterToCondition = (filter: TRequirementFilter) => {
  if (!filter.field_id) return null;

  if (filter.operator === "is_empty") {
    return createConditionNode({
      property: filter.field_id,
      operator: EQUALITY_OPERATOR.EXACT,
      value: REQUIREMENT_EMPTY_FILTER_VALUE,
    });
  }
  if (filter.operator === "is_not_empty") {
    return createConditionNode({
      property: filter.field_id,
      operator: EQUALITY_OPERATOR.EXACT,
      value: REQUIREMENT_NOT_EMPTY_FILTER_VALUE,
    });
  }

  const value = toScalarValue(filter.value) as TFilterValue;
  if (!hasValidValue(value)) return null;

  if (filter.operator === "contains") {
    return createConditionNode({
      property: filter.field_id,
      operator: EXTENDED_EQUALITY_OPERATOR.CONTAINS,
      value,
    });
  }
  if (filter.operator === "equals") {
    return createConditionNode({
      property: filter.field_id,
      operator: EQUALITY_OPERATOR.EXACT,
      value,
    });
  }
  return null;
};

export const requirementFiltersToInternalExpression = (
  filters: TRequirementFilter[] | undefined
): TFilterExpression<TRequirementGridFilterProperty> | null => {
  if (!filters?.length) return null;

  const nodes = filters
    .map((filter) => requirementFilterToCondition(filter))
    .filter((node): node is NonNullable<typeof node> => node !== null);

  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  return createAndGroupNode(nodes);
};
