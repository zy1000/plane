/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CompleteOrEmpty, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

export const OVERDUE_FILTER_PROPERTY_KEYS = [
  "entity_type",
  "status",
  "project_id",
  "assignee_id",
  "overdue_days",
  "deadline",
  "overdue_since",
] as const;

export type TOverdueFilterProperty = (typeof OVERDUE_FILTER_PROPERTY_KEYS)[number];

export type TOverdueFilterConditionKey = `${TOverdueFilterProperty}__${TSupportedOperators}`;

export type TOverdueFilterConditionData = Partial<{
  [K in TOverdueFilterConditionKey]: string | boolean | number;
}>;

export type TOverdueFilterAndGroup = {
  [LOGICAL_OPERATOR.AND]: TOverdueFilterExpressionData[];
};

export type TOverdueFilterGroup = TOverdueFilterAndGroup;

export type TOverdueFilterExpressionData = TOverdueFilterConditionData | TOverdueFilterGroup;

export type TOverdueFilterExpression = CompleteOrEmpty<TOverdueFilterExpressionData>;
