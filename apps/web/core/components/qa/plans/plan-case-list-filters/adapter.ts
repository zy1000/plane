/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isEmpty } from "lodash-es";
import { FilterAdapter } from "@plane/shared-state";
import type { SingleOrArray, TFilterExpression, TFilterValue, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR, MULTI_VALUE_OPERATORS } from "@plane/types";
import { createAndGroupNode, createConditionNode, isAndGroupNode, isConditionNode } from "@plane/utils";
import type {
  TPlanCaseFilterConditionData,
  TPlanCaseFilterExpression,
  TPlanCaseFilterExpressionData,
  TPlanCaseFilterProperty,
} from "./types";
import { PLAN_CASE_FILTER_PROPERTY_KEYS } from "./types";

class PlanCaseFiltersAdapter extends FilterAdapter<TPlanCaseFilterProperty, TPlanCaseFilterExpression> {
  toInternal(externalFilter: TPlanCaseFilterExpression): TFilterExpression<TPlanCaseFilterProperty> | null {
    if (!externalFilter || isEmpty(externalFilter)) return null;

    try {
      return this._convertExpressionToInternal(externalFilter);
    } catch (error) {
      console.error("Failed to convert plan case external filter to internal:", error);
      return null;
    }
  }

  private _convertExpressionToInternal(
    expression: TPlanCaseFilterExpressionData
  ): TFilterExpression<TPlanCaseFilterProperty> {
    if (!expression || isEmpty(expression)) {
      throw new Error("Invalid plan case expression: empty or null data");
    }

    if (this._isPlanCaseFilterConditionData(expression)) {
      const conditionResult = this._extractPlanCaseFilterConditionData(expression);
      if (!conditionResult) {
        throw new Error("Failed to extract plan case condition data");
      }

      const [property, operator, value] = conditionResult;
      return createConditionNode({
        property,
        operator,
        value,
      });
    }

    if (LOGICAL_OPERATOR.AND in expression) {
      const andExpression = expression as { [LOGICAL_OPERATOR.AND]: TPlanCaseFilterExpressionData[] };
      const andConditions = andExpression[LOGICAL_OPERATOR.AND];

      if (!Array.isArray(andConditions) || andConditions.length === 0) {
        throw new Error("AND group must contain at least one plan case condition");
      }

      const convertedConditions = andConditions.map((item) => this._convertExpressionToInternal(item));
      return createAndGroupNode(convertedConditions);
    }

    throw new Error(`Invalid plan case expression: unknown structure with keys [${Object.keys(expression).join(", ")}]`);
  }

  toExternal(internalFilter: TFilterExpression<TPlanCaseFilterProperty> | null): TPlanCaseFilterExpression {
    if (!internalFilter) return {};

    try {
      return this._convertExpressionToExternal(internalFilter);
    } catch (error) {
      console.error("Failed to convert plan case internal filter to external:", error);
      return {};
    }
  }

  private _convertExpressionToExternal(
    expression: TFilterExpression<TPlanCaseFilterProperty>
  ): TPlanCaseFilterExpressionData {
    if (isConditionNode(expression)) {
      return this._createPlanCaseFilterConditionData(expression.property, expression.operator, expression.value);
    }

    if (isAndGroupNode(expression)) {
      return {
        [LOGICAL_OPERATOR.AND]: expression.children.map((child) => this._convertExpressionToExternal(child)),
      };
    }

    throw new Error("Unknown plan case group node type for expression");
  }

  private _isPlanCaseFilterConditionData(data: unknown): data is TPlanCaseFilterConditionData {
    if (!data || typeof data !== "object" || isEmpty(data)) return false;

    const keys = Object.keys(data);
    if (keys.length === 0) return false;
    if (keys.some((key) => key === LOGICAL_OPERATOR.AND)) return false;

    return keys.every((key) => this._isValidPlanCaseFilterConditionKey(key));
  }

  private _isValidPlanCaseFilterConditionKey(key: string): boolean {
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

    if (!PLAN_CASE_FILTER_PROPERTY_KEYS.includes(property as TPlanCaseFilterProperty)) {
      return false;
    }

    return operator.length > 0;
  }

  private _extractPlanCaseFilterConditionData(
    data: TPlanCaseFilterConditionData
  ): [TPlanCaseFilterProperty, TSupportedOperators, SingleOrArray<TFilterValue>] | null {
    const keys = Object.keys(data);
    if (keys.length !== 1) {
      console.error("Plan case filter condition data must have exactly one key");
      return null;
    }

    const key = keys[0];
    if (!this._isValidPlanCaseFilterConditionKey(key)) {
      console.error(`Invalid plan case filter condition key: ${key}`);
      return null;
    }

    const lastDoubleUnderscoreIndex = key.lastIndexOf("__");
    const property = key.substring(0, lastDoubleUnderscoreIndex) as TPlanCaseFilterProperty;
    const operator = key.substring(lastDoubleUnderscoreIndex + 2) as TSupportedOperators;

    const rawValue = data[key as keyof TPlanCaseFilterConditionData] as TFilterValue;
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

  private _createPlanCaseFilterConditionData(
    property: TPlanCaseFilterProperty,
    operator: TSupportedOperators,
    value: SingleOrArray<TFilterValue>
  ): TPlanCaseFilterConditionData {
    const conditionKey = `${property}__${operator}`;
    const stringValue = Array.isArray(value) ? value.join(",") : value;

    return {
      [conditionKey]: stringValue as string | boolean | number,
    };
  }
}

export const planCaseFiltersAdapter = new PlanCaseFiltersAdapter();
