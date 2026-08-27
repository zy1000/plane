import { isEmpty } from "lodash-es";
import type { SingleOrArray, TFilterExpression, TFilterValue, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR, MULTI_VALUE_OPERATORS } from "@plane/types";
import { createAndGroupNode, createConditionNode, isAndGroupNode, isConditionNode } from "@plane/utils";
import { FilterAdapter } from "@plane/shared-state";
import type {
  TProjectRequirementFilterConditionData,
  TProjectRequirementFilterExpression,
  TProjectRequirementFilterExpressionData,
  TProjectRequirementFilterProperty,
} from "./types";
import { PROJECT_REQUIREMENT_FILTER_PROPERTY_KEYS } from "./types";

class ProjectRequirementFiltersAdapter extends FilterAdapter<
  TProjectRequirementFilterProperty,
  TProjectRequirementFilterExpression
> {
  toInternal(externalFilter: TProjectRequirementFilterExpression): TFilterExpression<TProjectRequirementFilterProperty> | null {
    if (!externalFilter || isEmpty(externalFilter)) return null;

    try {
      return this._convertExpressionToInternal(externalFilter);
    } catch (error) {
      console.error("Failed to convert project requirement filter to internal:", error);
      return null;
    }
  }

  private _convertExpressionToInternal(
    expression: TProjectRequirementFilterExpressionData
  ): TFilterExpression<TProjectRequirementFilterProperty> {
    if (!expression || isEmpty(expression)) {
      throw new Error("Invalid project requirement expression: empty or null data");
    }

    if (this._isConditionData(expression)) {
      const conditionResult = this._extractConditionData(expression);
      if (!conditionResult) {
        throw new Error("Failed to extract project requirement condition data");
      }

      const [property, operator, value] = conditionResult;
      return createConditionNode({
        property,
        operator,
        value,
      });
    }

    if (LOGICAL_OPERATOR.AND in expression) {
      const andExpression = expression as { [LOGICAL_OPERATOR.AND]: TProjectRequirementFilterExpressionData[] };
      const andConditions = andExpression[LOGICAL_OPERATOR.AND];

      if (!Array.isArray(andConditions) || andConditions.length === 0) {
        throw new Error("AND group must contain at least one project requirement condition");
      }

      return createAndGroupNode(andConditions.map((item) => this._convertExpressionToInternal(item)));
    }

    throw new Error(`Invalid project requirement expression: unknown structure with keys [${Object.keys(expression).join(", ")}]`);
  }

  toExternal(internalFilter: TFilterExpression<TProjectRequirementFilterProperty> | null): TProjectRequirementFilterExpression {
    if (!internalFilter) return {};

    try {
      return this._convertExpressionToExternal(internalFilter);
    } catch (error) {
      console.error("Failed to convert project requirement internal filter to external:", error);
      return {};
    }
  }

  private _convertExpressionToExternal(
    expression: TFilterExpression<TProjectRequirementFilterProperty>
  ): TProjectRequirementFilterExpressionData {
    if (isConditionNode(expression)) {
      return this._createConditionData(expression.property, expression.operator, expression.value);
    }

    if (isAndGroupNode(expression)) {
      return {
        [LOGICAL_OPERATOR.AND]: expression.children.map((child) => this._convertExpressionToExternal(child)),
      };
    }

    throw new Error("Unknown project requirement group node type for expression");
  }

  private _isConditionData(data: unknown): data is TProjectRequirementFilterConditionData {
    if (!data || typeof data !== "object" || isEmpty(data)) return false;

    const keys = Object.keys(data);
    if (keys.length === 0) return false;
    if (keys.some((key) => key === LOGICAL_OPERATOR.AND)) return false;

    return keys.every((key) => this._isValidConditionKey(key));
  }

  private _isValidConditionKey(key: string): boolean {
    if (typeof key !== "string" || key.length === 0) return false;

    const lastDoubleUnderscoreIndex = key.lastIndexOf("__");
    if (
      lastDoubleUnderscoreIndex === -1 ||
      lastDoubleUnderscoreIndex === 0 ||
      lastDoubleUnderscoreIndex === key.length - 2
    ) {
      return false;
    }

    const property = key.substring(0, lastDoubleUnderscoreIndex);
    const operator = key.substring(lastDoubleUnderscoreIndex + 2);

    if (!PROJECT_REQUIREMENT_FILTER_PROPERTY_KEYS.includes(property as TProjectRequirementFilterProperty)) {
      return false;
    }

    return operator.length > 0;
  }

  private _extractConditionData(
    data: TProjectRequirementFilterConditionData
  ): [TProjectRequirementFilterProperty, TSupportedOperators, SingleOrArray<TFilterValue>] | null {
    const keys = Object.keys(data);
    if (keys.length !== 1) {
      console.error("Project requirement filter condition data must have exactly one key");
      return null;
    }

    const key = keys[0];
    if (!this._isValidConditionKey(key)) {
      console.error(`Invalid project requirement filter condition key: ${key}`);
      return null;
    }

    const lastDoubleUnderscoreIndex = key.lastIndexOf("__");
    const property = key.substring(0, lastDoubleUnderscoreIndex) as TProjectRequirementFilterProperty;
    const operator = key.substring(lastDoubleUnderscoreIndex + 2) as TSupportedOperators;

    const rawValue = data[key as keyof TProjectRequirementFilterConditionData] as TFilterValue;
    const parsedValue = MULTI_VALUE_OPERATORS.includes(operator) ? this._parseFilterValue(rawValue) : rawValue;

    return [property, operator, parsedValue];
  }

  private _parseFilterValue(value: TFilterValue): SingleOrArray<TFilterValue> {
    if (!value) return value;
    if (typeof value !== "string") return value;
    if (value === "") return value;

    if (value.includes(",")) {
      const splitValues = value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      return splitValues.length === 1 ? splitValues[0] : splitValues;
    }

    return value;
  }

  private _createConditionData(
    property: TProjectRequirementFilterProperty,
    operator: TSupportedOperators,
    value: SingleOrArray<TFilterValue>
  ): TProjectRequirementFilterConditionData {
    const conditionKey = `${property}__${operator}`;
    const stringValue = Array.isArray(value) ? value.join(",") : value;

    return {
      [conditionKey]: stringValue as string | boolean | number,
    };
  }
}

export const projectRequirementFiltersAdapter = new ProjectRequirementFiltersAdapter();
