/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";

import { observer } from "mobx-react";
// plane imports
import type {
  TFilterConditionNode,
  TFilterValue,
  TFilterProperty,
  SingleOrArray,
  TSingleSelectFilterFieldConfig,
  TMultiSelectFilterFieldConfig,
  TDateFilterFieldConfig,
  TDateRangeFilterFieldConfig,
  TTextFilterFieldConfig,
  TNumberFilterFieldConfig,
  TFilterConditionNodeForDisplay,
} from "@plane/types";
import { FILTER_FIELD_TYPE, COMPARISON_OPERATOR, EXTENDED_COMPARISON_OPERATOR } from "@plane/types";
// local imports
import { AdditionalFilterValueInput } from "@/plane-web/components/rich-filters/filter-value-input/root";
import type { TFilterValueInputProps } from "../shared";
import { DateRangeFilterValueInput } from "./date/range";
import { SingleDateFilterValueInput } from "./date/single";
import { NumberRangeFilterValueInput } from "./number/range";
import { NumberFilterValueInput } from "./number/single";
import { MultiSelectFilterValueInput } from "./select/multi";
import { SingleSelectFilterValueInput } from "./select/single";
import { TextFilterValueInput } from "./text/single";

const NUMBER_RANGE_OPERATORS = new Set([COMPARISON_OPERATOR.RANGE, EXTENDED_COMPARISON_OPERATOR.NOT_RANGE]);

export const FilterValueInput = observer(function FilterValueInput<P extends TFilterProperty, V extends TFilterValue>(
  props: TFilterValueInputProps<P, V>
) {
  const { condition, filterFieldConfig, isDisabled = false, onChange } = props;

  // Single select input
  if (filterFieldConfig?.type === FILTER_FIELD_TYPE.SINGLE_SELECT) {
    return (
      <SingleSelectFilterValueInput<P>
        config={filterFieldConfig as TSingleSelectFilterFieldConfig<string>}
        condition={condition as TFilterConditionNodeForDisplay<P, string>}
        isDisabled={isDisabled}
        onChange={(value) => onChange(value as SingleOrArray<V>)}
      />
    );
  }

  // Multi select input
  if (filterFieldConfig?.type === FILTER_FIELD_TYPE.MULTI_SELECT) {
    return (
      <MultiSelectFilterValueInput<P>
        config={filterFieldConfig as TMultiSelectFilterFieldConfig<string>}
        condition={condition as TFilterConditionNode<P, string>}
        isDisabled={isDisabled}
        onChange={(value) => onChange(value as SingleOrArray<V>)}
      />
    );
  }

  // Date filter input
  if (filterFieldConfig?.type === FILTER_FIELD_TYPE.DATE) {
    return (
      <SingleDateFilterValueInput<P>
        config={filterFieldConfig as TDateFilterFieldConfig<string>}
        condition={condition as TFilterConditionNodeForDisplay<P, string>}
        isDisabled={isDisabled}
        onChange={(value) => onChange(value as SingleOrArray<V>)}
      />
    );
  }

  // Date range filter input
  if (filterFieldConfig?.type === FILTER_FIELD_TYPE.DATE_RANGE) {
    return (
      <DateRangeFilterValueInput<P>
        config={filterFieldConfig as TDateRangeFilterFieldConfig<string>}
        condition={condition as TFilterConditionNodeForDisplay<P, string>}
        isDisabled={isDisabled}
        onChange={(value) => onChange(value as SingleOrArray<V>)}
      />
    );
  }

  // Text filter input
  if (filterFieldConfig?.type === FILTER_FIELD_TYPE.TEXT) {
    return (
      <TextFilterValueInput<P>
        config={filterFieldConfig as TTextFilterFieldConfig<string>}
        condition={condition as TFilterConditionNodeForDisplay<P, string>}
        isDisabled={isDisabled}
        onChange={(value) => onChange(value as SingleOrArray<V>)}
      />
    );
  }

  // Number filter input (range or single)
  if (filterFieldConfig?.type === FILTER_FIELD_TYPE.NUMBER) {
    if (NUMBER_RANGE_OPERATORS.has(condition.operator as any)) {
      return (
        <NumberRangeFilterValueInput<P>
          config={filterFieldConfig as TNumberFilterFieldConfig<string>}
          condition={condition as TFilterConditionNodeForDisplay<P, string>}
          isDisabled={isDisabled}
          onChange={(value) => onChange(value as SingleOrArray<V>)}
        />
      );
    }
    return (
      <NumberFilterValueInput<P>
        config={filterFieldConfig as TNumberFilterFieldConfig<string>}
        condition={condition as TFilterConditionNodeForDisplay<P, string>}
        isDisabled={isDisabled}
        onChange={(value) => onChange(value as SingleOrArray<V>)}
      />
    );
  }

  return <AdditionalFilterValueInput {...props} />;
});
