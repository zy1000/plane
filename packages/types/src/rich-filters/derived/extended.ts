/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFilterValue } from "../expression";
import type { EXTENDED_EQUALITY_OPERATOR, EXTENDED_COMPARISON_OPERATOR } from "../operators";

// -------- DATE FILTER OPERATORS --------

/**
 * Extended operators that can apply to date fields (single-date or range).
 */
export type TExtendedSupportedDateFilterOperators<_V extends TFilterValue = TFilterValue> =
  | (typeof EXTENDED_EQUALITY_OPERATOR)["NOT_EXACT"]
  | (typeof EXTENDED_COMPARISON_OPERATOR)["LT"]
  | (typeof EXTENDED_COMPARISON_OPERATOR)["NOT_LT"]
  | (typeof EXTENDED_COMPARISON_OPERATOR)["LTE"]
  | (typeof EXTENDED_COMPARISON_OPERATOR)["NOT_LTE"]
  | (typeof EXTENDED_COMPARISON_OPERATOR)["GT"]
  | (typeof EXTENDED_COMPARISON_OPERATOR)["NOT_GT"]
  | (typeof EXTENDED_COMPARISON_OPERATOR)["GTE"]
  | (typeof EXTENDED_COMPARISON_OPERATOR)["NOT_GTE"]
  | (typeof EXTENDED_COMPARISON_OPERATOR)["NOT_RANGE"];

export type TExtendedAllAvailableDateFilterOperatorsForDisplay<V extends TFilterValue = TFilterValue> =
  TExtendedSupportedDateFilterOperators<V>;

// -------- SELECT FILTER OPERATORS --------

/**
 * Union type representing all extended operators that support select filter types.
 */
export type TExtendedSupportedSelectFilterOperators<_V extends TFilterValue = TFilterValue> = never;

export type TExtendedAllAvailableSelectFilterOperatorsForDisplay<_V extends TFilterValue = TFilterValue> = never;
