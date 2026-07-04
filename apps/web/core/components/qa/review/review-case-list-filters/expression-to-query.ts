/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LOGICAL_OPERATOR } from "@plane/types";
import type {
  TReviewCaseFilterExpression,
  TReviewCaseFilterExpressionData,
  TReviewCaseFilterProperty,
} from "./types";

export type TReviewCaseFilterQueryParams = {
  assignee__in?: string;
  module_ids?: string;
  priority__in?: string;
  repository_ids?: string;
  result__in?: string;
};

const toStringArray = (value: unknown): string[] => {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const mergeCsvValue = (
  params: TReviewCaseFilterQueryParams,
  key: "assignee__in" | "module_ids" | "priority__in" | "repository_ids" | "result__in",
  values: string[]
) => {
  if (values.length === 0) return;
  const currentValues = toStringArray(params[key]);
  const mergedValues = Array.from(new Set([...currentValues, ...values]));
  if (mergedValues.length > 0) {
    params[key] = mergedValues.join(",");
  }
};

const applyCondition = (
  params: TReviewCaseFilterQueryParams,
  property: TReviewCaseFilterProperty,
  value: unknown
) => {
  switch (property) {
    case "result":
      mergeCsvValue(params, "result__in", toStringArray(value));
      break;
    case "priority":
      mergeCsvValue(params, "priority__in", toStringArray(value));
      break;
    case "assignee":
      mergeCsvValue(params, "assignee__in", toStringArray(value));
      break;
    case "repository":
      mergeCsvValue(params, "repository_ids", toStringArray(value));
      break;
    case "module":
      mergeCsvValue(params, "module_ids", toStringArray(value));
      break;
    default:
      break;
  }
};

const walkExpression = (node: TReviewCaseFilterExpressionData, params: TReviewCaseFilterQueryParams) => {
  if (!node || typeof node !== "object") return;

  if (LOGICAL_OPERATOR.AND in node) {
    const andConditions = node[LOGICAL_OPERATOR.AND];
    if (Array.isArray(andConditions)) {
      andConditions.forEach((childNode) => walkExpression(childNode, params));
    }
    return;
  }

  Object.entries(node).forEach(([key, value]) => {
    const splitIndex = key.lastIndexOf("__");
    if (splitIndex <= 0) return;

    const property = key.slice(0, splitIndex) as TReviewCaseFilterProperty;
    applyCondition(params, property, value);
  });
};

export const reviewCaseExpressionToQueryParams = (
  expression: TReviewCaseFilterExpression
): TReviewCaseFilterQueryParams => {
  if (!expression || Object.keys(expression).length === 0) {
    return {};
  }

  const queryParams: TReviewCaseFilterQueryParams = {};
  walkExpression(expression, queryParams);
  return queryParams;
};
