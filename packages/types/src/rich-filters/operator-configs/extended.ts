/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFilterValue } from "../expression";
import type {
  TDateFilterFieldConfig,
  TDateRangeFilterFieldConfig,
  TMultiSelectFilterFieldConfig,
  TNumberFilterFieldConfig,
  TSingleSelectFilterFieldConfig,
  TTextFilterFieldConfig,
} from "../field-types";
import type {
  EXTENDED_EQUALITY_OPERATOR,
  EXTENDED_COLLECTION_OPERATOR,
  EXTENDED_COMPARISON_OPERATOR,
} from "../operators";

// ----------------------------- EXACT Operator -----------------------------
// exact can also apply to text and number input fields
export type TExtendedExactOperatorConfigs = TTextFilterFieldConfig<TFilterValue> | TNumberFilterFieldConfig<TFilterValue>;

// ----------------------------- IN Operator -----------------------------
export type TExtendedInOperatorConfigs = never;

// ----------------------------- RANGE Operator -----------------------------
// range applies to number fields in addition to date fields
export type TExtendedRangeOperatorConfigs = TNumberFilterFieldConfig<TFilterValue>;

// ----------------------------- Extended Operator Specific Configs -----------------------------
type TNumericOrDateConfig = TNumberFilterFieldConfig<TFilterValue> | TDateFilterFieldConfig<TFilterValue>;
type TNumericOrDateRangeConfig = TNumberFilterFieldConfig<TFilterValue> | TDateRangeFilterFieldConfig<TFilterValue>;

export type TExtendedOperatorSpecificConfigs = {
  [EXTENDED_EQUALITY_OPERATOR.NOT_EXACT]:
    | TSingleSelectFilterFieldConfig<TFilterValue>
    | TDateFilterFieldConfig<TFilterValue>
    | TTextFilterFieldConfig<TFilterValue>
    | TNumberFilterFieldConfig<TFilterValue>;
  [EXTENDED_EQUALITY_OPERATOR.CONTAINS]: TTextFilterFieldConfig<TFilterValue>;
  [EXTENDED_EQUALITY_OPERATOR.NOT_CONTAINS]: TTextFilterFieldConfig<TFilterValue>;
  [EXTENDED_COLLECTION_OPERATOR.NOT_IN]: TMultiSelectFilterFieldConfig<TFilterValue>;
  [EXTENDED_COMPARISON_OPERATOR.LT]: TNumericOrDateConfig;
  [EXTENDED_COMPARISON_OPERATOR.NOT_LT]: TNumericOrDateConfig;
  [EXTENDED_COMPARISON_OPERATOR.LTE]: TNumericOrDateConfig;
  [EXTENDED_COMPARISON_OPERATOR.NOT_LTE]: TNumericOrDateConfig;
  [EXTENDED_COMPARISON_OPERATOR.GT]: TNumericOrDateConfig;
  [EXTENDED_COMPARISON_OPERATOR.NOT_GT]: TNumericOrDateConfig;
  [EXTENDED_COMPARISON_OPERATOR.GTE]: TNumericOrDateConfig;
  [EXTENDED_COMPARISON_OPERATOR.NOT_GTE]: TNumericOrDateConfig;
  [EXTENDED_COMPARISON_OPERATOR.NOT_RANGE]: TNumericOrDateRangeConfig;
};
