/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TExtendedSupportedOperators, TExtendedSupportedDateFilterOperators } from "@plane/types";
import { EXTENDED_EQUALITY_OPERATOR, EXTENDED_COLLECTION_OPERATOR, EXTENDED_COMPARISON_OPERATOR } from "@plane/types";

/**
 * Extended operator labels (generic, non-date context)
 */
export const EXTENDED_OPERATOR_LABELS_MAP: Record<TExtendedSupportedOperators, string> = {
  [EXTENDED_EQUALITY_OPERATOR.NOT_EXACT]: "is not",
  [EXTENDED_EQUALITY_OPERATOR.CONTAINS]: "contains",
  [EXTENDED_EQUALITY_OPERATOR.NOT_CONTAINS]: "not contains",
  [EXTENDED_COLLECTION_OPERATOR.NOT_IN]: "is none of",
  [EXTENDED_COMPARISON_OPERATOR.LT]: "less than",
  [EXTENDED_COMPARISON_OPERATOR.NOT_LT]: "not less than",
  [EXTENDED_COMPARISON_OPERATOR.LTE]: "less than or equal",
  [EXTENDED_COMPARISON_OPERATOR.NOT_LTE]: "not less than or equal",
  [EXTENDED_COMPARISON_OPERATOR.GT]: "greater than",
  [EXTENDED_COMPARISON_OPERATOR.NOT_GT]: "not greater than",
  [EXTENDED_COMPARISON_OPERATOR.GTE]: "greater than or equal",
  [EXTENDED_COMPARISON_OPERATOR.NOT_GTE]: "not greater than or equal",
  [EXTENDED_COMPARISON_OPERATOR.NOT_RANGE]: "not between",
} as const;

/**
 * Extended date-specific operator labels
 */
export const EXTENDED_DATE_OPERATOR_LABELS_MAP: Record<TExtendedSupportedDateFilterOperators, string> = {
  [EXTENDED_EQUALITY_OPERATOR.NOT_EXACT]: "is not",
  [EXTENDED_COMPARISON_OPERATOR.LT]: "before",
  [EXTENDED_COMPARISON_OPERATOR.NOT_LT]: "not before",
  [EXTENDED_COMPARISON_OPERATOR.LTE]: "before or on",
  [EXTENDED_COMPARISON_OPERATOR.NOT_LTE]: "not before or on",
  [EXTENDED_COMPARISON_OPERATOR.GT]: "after",
  [EXTENDED_COMPARISON_OPERATOR.NOT_GT]: "not after",
  [EXTENDED_COMPARISON_OPERATOR.GTE]: "after or on",
  [EXTENDED_COMPARISON_OPERATOR.NOT_GTE]: "not after or on",
  [EXTENDED_COMPARISON_OPERATOR.NOT_RANGE]: "not between",
} as const;

/**
 * Negated operator labels for all operators
 */
export const NEGATED_OPERATOR_LABELS_MAP: Record<never, string> = {} as const;

/**
 * Negated date operator labels for all date operators
 */
export const NEGATED_DATE_OPERATOR_LABELS_MAP: Record<never, string> = {} as const;
