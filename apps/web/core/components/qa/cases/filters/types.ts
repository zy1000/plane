/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CompleteOrEmpty, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

export const CASE_FILTER_PROPERTY_KEYS = ["review", "type", "priority", "assignee", "labels"] as const;

export type TCaseFilterProperty = (typeof CASE_FILTER_PROPERTY_KEYS)[number];

export type TCaseFilterConditionKey = `${TCaseFilterProperty}__${TSupportedOperators}`;

export type TCaseFilterConditionData = Partial<{
  [K in TCaseFilterConditionKey]: string | boolean | number;
}>;

export type TCaseFilterAndGroup = {
  [LOGICAL_OPERATOR.AND]: TCaseFilterExpressionData[];
};

export type TCaseFilterGroup = TCaseFilterAndGroup;

export type TCaseFilterExpressionData = TCaseFilterConditionData | TCaseFilterGroup;

export type TCaseFilterExpression = CompleteOrEmpty<TCaseFilterExpressionData>;
