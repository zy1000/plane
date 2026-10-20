import type { TFilterExpression, TFilterValue, TRequirementFilter } from "@plane/types";
import { COLLECTION_OPERATOR, EQUALITY_OPERATOR, EXTENDED_EQUALITY_OPERATOR } from "@plane/types";
import { createAndGroupNode, createConditionNode, extractConditions, hasValidValue } from "@plane/utils";
import type { TRequirementGridFilterExpression, TRequirementGridFilterProperty } from "./types";

/** 富过滤没有空/非空算子，用 EXACT + 哨兵值映射到后端 is_empty / is_not_empty */
export const REQUIREMENT_EMPTY_FILTER_VALUE = "__empty__";
export const REQUIREMENT_NOT_EMPTY_FILTER_VALUE = "__not_empty__";

/**
 * 「模块」条件的 field_id（后端 MODULE_FILTER_FIELD_ID）。它不是行上的字段：多选、值为模块 id 或 "none"（未归类），
 * 以 { field_id, operator: "equals", value: string[] } 传给后端，由后端按子树展开 / 未挂靠取或
 */
export const REQUIREMENT_MODULE_FILTER_FIELD = "module_id";

const toScalarValue = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

const toStringValues = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value])
    .map((item) => (item === null || item === undefined ? "" : String(item)))
    .filter((item) => item.length > 0);

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

    if (condition.property === REQUIREMENT_MODULE_FILTER_FIELD) {
      const moduleValues = toStringValues(condition.value);
      if (moduleValues.length > 0) filters.push({ field_id: condition.property, operator: "equals", value: moduleValues });
      continue;
    }

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

  if (filter.field_id === REQUIREMENT_MODULE_FILTER_FIELD) {
    const moduleValues = toStringValues(filter.value);
    if (moduleValues.length === 0) return null;
    return createConditionNode({
      property: filter.field_id,
      operator: COLLECTION_OPERATOR.IN,
      value: moduleValues,
    });
  }

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
