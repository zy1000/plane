/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LOGICAL_OPERATOR } from "@plane/types";
import type { TReviewFilterExpression, TReviewFilterExpressionData, TReviewFilterProperty } from "./types";

export type TReviewsFilterQueryParams = {
  assignee__in?: string;
  ended_at__gte?: string;
  mode__in?: string;
  started_at__lte?: string;
  state__in?: string;
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
  params: TReviewsFilterQueryParams,
  key: "assignee__in" | "mode__in" | "state__in",
  values: string[]
) => {
  if (values.length === 0) return;
  const currentValues = toStringArray(params[key]);
  const mergedValues = Array.from(new Set([...currentValues, ...values]));
  if (mergedValues.length > 0) {
    params[key] = mergedValues.join(",");
  }
};

const applyPeriodFilter = (params: TReviewsFilterQueryParams, value: unknown) => {
  const values = toStringArray(value);
  if (values.length === 0) return;

  if (values.length === 1) {
    params.ended_at__gte = values[0];
    params.started_at__lte = values[0];
    return;
  }

  const [startDate, endDate] = values;
  if (startDate) params.ended_at__gte = startDate;
  if (endDate) params.started_at__lte = endDate;
};

const applyCondition = (params: TReviewsFilterQueryParams, property: TReviewFilterProperty, value: unknown) => {
  switch (property) {
    case "state":
      mergeCsvValue(params, "state__in", toStringArray(value));
      break;
    case "mode":
      mergeCsvValue(params, "mode__in", toStringArray(value));
      break;
    case "assignee":
      mergeCsvValue(params, "assignee__in", toStringArray(value));
      break;
    case "period":
      applyPeriodFilter(params, value);
      break;
    default:
      break;
  }
};

const walkExpression = (node: TReviewFilterExpressionData, params: TReviewsFilterQueryParams) => {
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

    const property = key.slice(0, splitIndex) as TReviewFilterProperty;
    applyCondition(params, property, value);
  });
};

export const reviewsExpressionToQueryParams = (expression: TReviewFilterExpression): TReviewsFilterQueryParams => {
  if (!expression || Object.keys(expression).length === 0) {
    return {};
  }

  const queryParams: TReviewsFilterQueryParams = {};
  walkExpression(expression, queryParams);
  return queryParams;
};
