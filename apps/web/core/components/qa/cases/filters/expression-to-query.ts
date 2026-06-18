/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LOGICAL_OPERATOR } from "@plane/types";
import type { TCaseFilterExpression, TCaseFilterExpressionData, TCaseFilterProperty } from "./types";

export type TCasesFilterQueryParams = {
  assignee__in?: string;
  labels__name__icontains?: string;
  priority__in?: string;
  review__in?: string;
  type__in?: string;
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
  params: TCasesFilterQueryParams,
  key: "assignee__in" | "priority__in" | "review__in" | "type__in",
  values: string[]
) => {
  if (values.length === 0) return;
  const currentValues = toStringArray(params[key]);
  const mergedValues = Array.from(new Set([...currentValues, ...values]));
  if (mergedValues.length > 0) {
    params[key] = mergedValues.join(",");
  }
};

const applyCondition = (params: TCasesFilterQueryParams, property: TCaseFilterProperty, value: unknown) => {
  switch (property) {
    case "review":
      mergeCsvValue(params, "review__in", toStringArray(value));
      break;
    case "type":
      mergeCsvValue(params, "type__in", toStringArray(value));
      break;
    case "priority":
      mergeCsvValue(params, "priority__in", toStringArray(value));
      break;
    case "assignee":
      mergeCsvValue(params, "assignee__in", toStringArray(value));
      break;
    case "labels": {
      const textValue = String(value ?? "").trim();
      if (textValue) {
        params.labels__name__icontains = textValue;
      }
      break;
    }
    default:
      break;
  }
};

const walkExpression = (node: TCaseFilterExpressionData, params: TCasesFilterQueryParams) => {
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

    const property = key.slice(0, splitIndex) as TCaseFilterProperty;
    applyCondition(params, property, value);
  });
};

export const casesExpressionToQueryParams = (expression: TCaseFilterExpression): TCasesFilterQueryParams => {
  if (!expression || Object.keys(expression).length === 0) {
    return {};
  }

  const queryParams: TCasesFilterQueryParams = {};
  walkExpression(expression, queryParams);
  return queryParams;
};
