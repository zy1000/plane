/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LOGICAL_OPERATOR } from "@plane/types";
import type {
  TPlanCaseFilterExpression,
  TPlanCaseFilterExpressionData,
  TPlanCaseFilterProperty,
} from "./types";

export type TPlanCaseFilterQueryParams = {
  assignee_id__in?: string;
  case__module_id__in?: string;
  case__priority__in?: string;
  case__repository_id__in?: string;
  case__type__in?: string;
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

const mergeCsvValue = (params: TPlanCaseFilterQueryParams, key: keyof TPlanCaseFilterQueryParams, values: string[]) => {
  if (values.length === 0) return;
  const currentValues = toStringArray(params[key]);
  const mergedValues = Array.from(new Set([...currentValues, ...values]));
  if (mergedValues.length > 0) {
    params[key] = mergedValues.join(",");
  }
};

const applyCondition = (
  params: TPlanCaseFilterQueryParams,
  property: TPlanCaseFilterProperty,
  value: unknown
) => {
  switch (property) {
    case "result":
      mergeCsvValue(params, "result__in", toStringArray(value));
      break;
    case "type":
      mergeCsvValue(params, "case__type__in", toStringArray(value));
      break;
    case "priority":
      mergeCsvValue(params, "case__priority__in", toStringArray(value));
      break;
    case "assignee":
      mergeCsvValue(params, "assignee_id__in", toStringArray(value));
      break;
    case "repository":
      mergeCsvValue(params, "case__repository_id__in", toStringArray(value));
      break;
    case "module":
      mergeCsvValue(params, "case__module_id__in", toStringArray(value));
      break;
    default:
      break;
  }
};

const walkExpression = (node: TPlanCaseFilterExpressionData, params: TPlanCaseFilterQueryParams) => {
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

    const property = key.slice(0, splitIndex) as TPlanCaseFilterProperty;
    applyCondition(params, property, value);
  });
};

export const planCaseExpressionToQueryParams = (
  expression: TPlanCaseFilterExpression
): TPlanCaseFilterQueryParams => {
  if (!expression || Object.keys(expression).length === 0) {
    return {};
  }

  const queryParams: TPlanCaseFilterQueryParams = {};
  walkExpression(expression, queryParams);
  return queryParams;
};
