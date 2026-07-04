/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CompleteOrEmpty, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

export const REVIEW_FILTER_PROPERTY_KEYS = ["state", "mode", "assignee", "period"] as const;

export type TReviewFilterProperty = (typeof REVIEW_FILTER_PROPERTY_KEYS)[number];

export type TReviewFilterConditionKey = `${TReviewFilterProperty}__${TSupportedOperators}`;

export type TReviewFilterConditionData = Partial<{
  [K in TReviewFilterConditionKey]: string | boolean | number;
}>;

export type TReviewFilterAndGroup = {
  [LOGICAL_OPERATOR.AND]: TReviewFilterExpressionData[];
};

export type TReviewFilterGroup = TReviewFilterAndGroup;

export type TReviewFilterExpressionData = TReviewFilterConditionData | TReviewFilterGroup;

export type TReviewFilterExpression = CompleteOrEmpty<TReviewFilterExpressionData>;
