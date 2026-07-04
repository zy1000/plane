/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CompleteOrEmpty, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

export const PLAN_CASE_FILTER_PROPERTY_KEYS = [
  "result",
  "type",
  "priority",
  "assignee",
  "repository",
  "module",
] as const;

export type TPlanCaseFilterProperty = (typeof PLAN_CASE_FILTER_PROPERTY_KEYS)[number];

export type TPlanCaseFilterConditionKey = `${TPlanCaseFilterProperty}__${TSupportedOperators}`;

export type TPlanCaseFilterConditionData = Partial<{
  [K in TPlanCaseFilterConditionKey]: string | boolean | number;
}>;

export type TPlanCaseFilterAndGroup = {
  [LOGICAL_OPERATOR.AND]: TPlanCaseFilterExpressionData[];
};

export type TPlanCaseFilterGroup = TPlanCaseFilterAndGroup;

export type TPlanCaseFilterExpressionData = TPlanCaseFilterConditionData | TPlanCaseFilterGroup;

export type TPlanCaseFilterExpression = CompleteOrEmpty<TPlanCaseFilterExpressionData>;
