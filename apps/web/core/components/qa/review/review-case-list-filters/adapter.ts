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
  TReviewCaseFilterConditionData,
  TReviewCaseFilterExpression,
  TReviewCaseFilterExpressionData,
  TReviewCaseFilterProperty,
} from "./types";
import { REVIEW_CASE_FILTER_PROPERTY_KEYS } from "./types";

class ReviewCaseFiltersAdapter extends FilterAdapter<TReviewCaseFilterProperty, TReviewCaseFilterExpression> {
  toInternal(externalFilter: TReviewCaseFilterExpression): TFilterExpression<TReviewCaseFilterProperty> | null {
    if (!externalFilter || isEmpty(externalFilter)) return null;

    try {
      return this._convertExpressionToInternal(externalFilter);
    } catch (error) {
      console.error("Failed to convert review case external filter to internal:", error);
      return null;
    }
  }

  private _convertExpressionToInternal(
    expression: TReviewCaseFilterExpressionData
  ): TFilterExpression<TReviewCaseFilterProperty> {
    if (!expression || isEmpty(expression)) {
      throw new Error("Invalid review case expression: empty or null data");
    }

    if (this._isReviewCaseFilterConditionData(expression)) {
      const conditionResult = this._extractReviewCaseFilterConditionData(expression);
      if (!conditionResult) {
        throw new Error("Failed to extract review case condition data");
      }

      const [property, operator, value] = conditionResult;
      return createConditionNode({
        property,
        operator,
        value,
      });
    }

    if (LOGICAL_OPERATOR.AND in expression) {
      const andExpression = expression as { [LOGICAL_OPERATOR.AND]: TReviewCaseFilterExpressionData[] };
      const andConditions = andExpression[LOGICAL_OPERATOR.AND];

      if (!Array.isArray(andConditions) || andConditions.length === 0) {
        throw new Error("AND group must contain at least one review case condition");
      }

      const convertedConditions = andConditions.map((item) => this._convertExpressionToInternal(item));
      return createAndGroupNode(convertedConditions);
    }

    throw new Error(
      `Invalid review case expression: unknown structure with keys [${Object.keys(expression).join(", ")}]`
    );
  }

  toExternal(internalFilter: TFilterExpression<TReviewCaseFilterProperty> | null): TReviewCaseFilterExpression {
    if (!internalFilter) return {};

    try {
      return this._convertExpressionToExternal(internalFilter);
    } catch (error) {
      console.error("Failed to convert review case internal filter to external:", error);
      return {};
    }
  }

  private _convertExpressionToExternal(
    expression: TFilterExpression<TReviewCaseFilterProperty>
  ): TReviewCaseFilterExpressionData {
    if (isConditionNode(expression)) {
      return this._createReviewCaseFilterConditionData(expression.property, expression.operator, expression.value);
    }

    if (isAndGroupNode(expression)) {
      return {
        [LOGICAL_OPERATOR.AND]: expression.children.map((child) => this._convertExpressionToExternal(child)),
      };
    }

    throw new Error("Unknown review case group node type for expression");
  }

  private _isReviewCaseFilterConditionData(data: unknown): data is TReviewCaseFilterConditionData {
    if (!data || typeof data !== "object" || isEmpty(data)) return false;

    const keys = Object.keys(data);
    if (keys.length === 0) return false;
    if (keys.some((key) => key === LOGICAL_OPERATOR.AND)) return false;

    return keys.every((key) => this._isValidReviewCaseFilterConditionKey(key));
  }

  private _isValidReviewCaseFilterConditionKey(key: string): boolean {
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

    if (!REVIEW_CASE_FILTER_PROPERTY_KEYS.includes(property as TReviewCaseFilterProperty)) {
      return false;
    }

    return operator.length > 0;
  }

  private _extractReviewCaseFilterConditionData(
    data: TReviewCaseFilterConditionData
  ): [TReviewCaseFilterProperty, TSupportedOperators, SingleOrArray<TFilterValue>] | null {
    const keys = Object.keys(data);
    if (keys.length !== 1) {
      console.error("Review case filter condition data must have exactly one key");
      return null;
    }

    const key = keys[0];
    if (!this._isValidReviewCaseFilterConditionKey(key)) {
      console.error(`Invalid review case filter condition key: ${key}`);
      return null;
    }

    const lastDoubleUnderscoreIndex = key.lastIndexOf("__");
    const property = key.substring(0, lastDoubleUnderscoreIndex) as TReviewCaseFilterProperty;
    const operator = key.substring(lastDoubleUnderscoreIndex + 2) as TSupportedOperators;

    const rawValue = data[key as keyof TReviewCaseFilterConditionData] as TFilterValue;
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

  private _createReviewCaseFilterConditionData(
    property: TReviewCaseFilterProperty,
    operator: TSupportedOperators,
    value: SingleOrArray<TFilterValue>
  ): TReviewCaseFilterConditionData {
    const conditionKey = `${property}__${operator}`;
    const stringValue = Array.isArray(value) ? value.join(",") : value;

    return {
      [conditionKey]: stringValue as string | boolean | number,
    };
  }
}

export const reviewCaseFiltersAdapter = new ReviewCaseFiltersAdapter();
