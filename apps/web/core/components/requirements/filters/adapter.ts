import { isEmpty } from "lodash-es";
import type { TFilterExpression } from "@plane/types";
import { FilterAdapter } from "@plane/shared-state";
import {
  internalExpressionToRequirementFilters,
  requirementFiltersToInternalExpression,
} from "./expression-to-requirement-filters";
import type { TRequirementGridFilterExpression, TRequirementGridFilterProperty } from "./types";

class RequirementGridFiltersAdapter extends FilterAdapter<
  TRequirementGridFilterProperty,
  TRequirementGridFilterExpression
> {
  toInternal(
    externalFilter: TRequirementGridFilterExpression
  ): TFilterExpression<TRequirementGridFilterProperty> | null {
    if (!externalFilter || isEmpty(externalFilter) || !externalFilter.filters?.length) return null;

    try {
      return requirementFiltersToInternalExpression(externalFilter.filters);
    } catch (error) {
      console.error("Failed to convert requirement grid filter to internal:", error);
      return null;
    }
  }

  toExternal(
    internalFilter: TFilterExpression<TRequirementGridFilterProperty> | null
  ): TRequirementGridFilterExpression {
    return { filters: internalExpressionToRequirementFilters(internalFilter) };
  }
}

export const requirementGridFiltersAdapter = new RequirementGridFiltersAdapter();
