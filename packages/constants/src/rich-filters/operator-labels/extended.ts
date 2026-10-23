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
  [EXTENDED_EQUALITY_OPERATOR.NOT_EXACT]: "不是",
  [EXTENDED_EQUALITY_OPERATOR.CONTAINS]: "包含",
  [EXTENDED_EQUALITY_OPERATOR.NOT_CONTAINS]: "不包含",
  [EXTENDED_COLLECTION_OPERATOR.NOT_IN]: "不属于",
  [EXTENDED_COMPARISON_OPERATOR.LT]: "小于",
  [EXTENDED_COMPARISON_OPERATOR.NOT_LT]: "不小于",
  [EXTENDED_COMPARISON_OPERATOR.LTE]: "小于等于",
  [EXTENDED_COMPARISON_OPERATOR.NOT_LTE]: "不小于等于",
  [EXTENDED_COMPARISON_OPERATOR.GT]: "大于",
  [EXTENDED_COMPARISON_OPERATOR.NOT_GT]: "不大于",
  [EXTENDED_COMPARISON_OPERATOR.GTE]: "大于等于",
  [EXTENDED_COMPARISON_OPERATOR.NOT_GTE]: "不大于等于",
  [EXTENDED_COMPARISON_OPERATOR.NOT_RANGE]: "不介于",
} as const;

/**
 * Extended date-specific operator labels
 */
export const EXTENDED_DATE_OPERATOR_LABELS_MAP: Record<TExtendedSupportedDateFilterOperators, string> = {
  [EXTENDED_EQUALITY_OPERATOR.NOT_EXACT]: "不是",
  [EXTENDED_COMPARISON_OPERATOR.LT]: "早于",
  [EXTENDED_COMPARISON_OPERATOR.NOT_LT]: "不早于",
  [EXTENDED_COMPARISON_OPERATOR.LTE]: "早于或等于",
  [EXTENDED_COMPARISON_OPERATOR.NOT_LTE]: "不早于或等于",
  [EXTENDED_COMPARISON_OPERATOR.GT]: "晚于",
  [EXTENDED_COMPARISON_OPERATOR.NOT_GT]: "不晚于",
  [EXTENDED_COMPARISON_OPERATOR.GTE]: "晚于或等于",
  [EXTENDED_COMPARISON_OPERATOR.NOT_GTE]: "不晚于或等于",
  [EXTENDED_COMPARISON_OPERATOR.NOT_RANGE]: "不介于",
} as const;

/**
 * Negated operator labels for all operators
 */
export const NEGATED_OPERATOR_LABELS_MAP: Record<never, string> = {} as const;

/**
 * Negated date operator labels for all date operators
 */
export const NEGATED_DATE_OPERATOR_LABELS_MAP: Record<never, string> = {} as const;
