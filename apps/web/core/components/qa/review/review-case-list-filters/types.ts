/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CompleteOrEmpty, TSupportedOperators } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

export const REVIEW_CASE_FILTER_PROPERTY_KEYS = ["result", "priority", "assignee", "repository", "module"] as const;

export type TReviewCaseFilterProperty = (typeof REVIEW_CASE_FILTER_PROPERTY_KEYS)[number];

export type TReviewCaseFilterConditionKey = `${TReviewCaseFilterProperty}__${TSupportedOperators}`;

export type TReviewCaseFilterConditionData = Partial<{
  [K in TReviewCaseFilterConditionKey]: string | boolean | number;
}>;

export type TReviewCaseFilterAndGroup = {
  [LOGICAL_OPERATOR.AND]: TReviewCaseFilterExpressionData[];
};

export type TReviewCaseFilterGroup = TReviewCaseFilterAndGroup;

export type TReviewCaseFilterExpressionData = TReviewCaseFilterConditionData | TReviewCaseFilterGroup;

export type TReviewCaseFilterExpression = CompleteOrEmpty<TReviewCaseFilterExpressionData>;
