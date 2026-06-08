/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isEmpty } from "lodash-es";
import type {
  SingleOrArray,
  TFilterExpression,
  TFilterValue,
  TSupportedOperators,
} from "@plane/types";
import { LOGICAL_OPERATOR, MULTI_VALUE_OPERATORS } from "@plane/types";
import { createAndGroupNode, createConditionNode, isAndGroupNode, isConditionNode } from "@plane/utils";
import { FilterAdapter } from "@plane/shared-state";
import type {
  TOverdueFilterConditionData,
  TOverdueFilterExpression,
  TOverdueFilterExpressionData,
  TOverdueFilterProperty,
} from "./types";
import { OVERDUE_FILTER_PROPERTY_KEYS } from "./types";

class OverdueFiltersAdapter extends FilterAdapter<TOverdueFilterProperty, TOverdueFilterExpression> {
  toInternal(externalFilter: TOverdueFilterExpression): TFilterExpression<TOverdueFilterProperty> | null {
    if (!externalFilter || isEmpty(externalFilter)) return null;

    try {
      return this._convertExpressionToInternal(externalFilter);
    } catch (error) {
      console.error("Failed to convert overdue external filter to internal:", error);
      return null;
    }
  }

  private _convertExpressionToInternal(expression: TOverdueFilterExpressionData): TFilterExpression<TOverdueFilterProperty> {
    if (!expression || isEmpty(expression)) {
      throw new Error("Invalid overdue expression: empty or null data");
    }

    if (this._isOverdueFilterConditionData(expression)) {
      const conditionResult = this._extractOverdueFilterConditionData(expression);
      if (!conditionResult) {
        throw new Error("Failed to extract overdue condition data");
      }

      const [property, operator, value] = conditionResult;
      return createConditionNode({
        property,
        operator,
        value,
      });
    }

    if (LOGICAL_OPERATOR.AND in expression) {
      const andExpression = expression as { [LOGICAL_OPERATOR.AND]: TOverdueFilterExpressionData[] };
      const andConditions = andExpression[LOGICAL_OPERATOR.AND];

      if (!Array.isArray(andConditions) || andConditions.length === 0) {
        throw new Error("AND group must contain at least one overdue condition");
      }

      const convertedConditions = andConditions.map((item) => this._convertExpressionToInternal(item));
      return createAndGroupNode(convertedConditions);
    }

    throw new Error(`Invalid overdue expression: unknown structure with keys [${Object.keys(expression).join(", ")}]`);
  }

  toExternal(internalFilter: TFilterExpression<TOverdueFilterProperty> | null): TOverdueFilterExpression {
    if (!internalFilter) return {};

    try {
      return this._convertExpressionToExternal(internalFilter);
    } catch (error) {
      console.error("Failed to convert overdue internal filter to external:", error);
      return {};
    }
  }

  private _convertExpressionToExternal(expression: TFilterExpression<TOverdueFilterProperty>): TOverdueFilterExpressionData {
    if (isConditionNode(expression)) {
      return this._createOverdueFilterConditionData(expression.property, expression.operator, expression.value);
    }

    if (isAndGroupNode(expression)) {
      return {
        [LOGICAL_OPERATOR.AND]: expression.children.map((child) => this._convertExpressionToExternal(child)),
      };
    }

    throw new Error("Unknown overdue group node type for expression");
  }

  private _isOverdueFilterConditionData(data: unknown): data is TOverdueFilterConditionData {
    if (!data || typeof data !== "object" || isEmpty(data)) return false;

    const keys = Object.keys(data);
    if (keys.length === 0) return false;
    if (keys.some((key) => key === LOGICAL_OPERATOR.AND)) return false;

    return keys.every((key) => this._isValidOverdueFilterConditionKey(key));
  }

  private _isValidOverdueFilterConditionKey(key: string): boolean {
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

    if (!OVERDUE_FILTER_PROPERTY_KEYS.includes(property as TOverdueFilterProperty)) {
      return false;
    }

    return operator.length > 0;
  }

  private _extractOverdueFilterConditionData(
    data: TOverdueFilterConditionData
  ): [TOverdueFilterProperty, TSupportedOperators, SingleOrArray<TFilterValue>] | null {
    const keys = Object.keys(data);
    if (keys.length !== 1) {
      console.error("Overdue filter condition data must have exactly one key");
      return null;
    }

    const key = keys[0];
    if (!this._isValidOverdueFilterConditionKey(key)) {
      console.error(`Invalid overdue filter condition key: ${key}`);
      return null;
    }

    const lastDoubleUnderscoreIndex = key.lastIndexOf("__");
    const property = key.substring(0, lastDoubleUnderscoreIndex) as TOverdueFilterProperty;
    const operator = key.substring(lastDoubleUnderscoreIndex + 2) as TSupportedOperators;

    const rawValue = data[key as keyof TOverdueFilterConditionData] as TFilterValue;
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
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      return splitValues.length === 1 ? splitValues[0] : splitValues;
    }

    return value;
  }

  private _createOverdueFilterConditionData(
    property: TOverdueFilterProperty,
    operator: TSupportedOperators,
    value: SingleOrArray<TFilterValue>
  ): TOverdueFilterConditionData {
    const conditionKey = `${property}__${operator}`;
    const stringValue = Array.isArray(value) ? value.join(",") : value;

    return {
      [conditionKey]: stringValue as string | boolean | number,
    };
  }
}

export const overdueFiltersAdapter = new OverdueFiltersAdapter();
