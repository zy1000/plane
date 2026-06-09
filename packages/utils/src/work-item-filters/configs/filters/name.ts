/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterProperty } from "@plane/types";
import { EXTENDED_EQUALITY_OPERATOR } from "@plane/types";
// local imports
import type { IFilterIconConfig, TCreateFilterConfig, TCreateFilterConfigParams } from "../../../rich-filters";
import { createFilterConfig, createOperatorConfigEntry, getTextInputConfig } from "../../../rich-filters";

// ------------ Name filter ------------

export type TCreateNameFilterParams = TCreateFilterConfigParams & IFilterIconConfig;

/**
 * Get the work item name text filter config.
 * @template P - The filter key
 * @param key - The filter key to use
 * @returns A function that takes parameters and returns the name filter config
 */
export const getNameFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateNameFilterParams> =>
  (params: TCreateNameFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "名称",
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.CONTAINS, params, (updatedParams) =>
          getTextInputConfig({
            ...updatedParams,
            placeholder: "搜索工作项名称...",
          })
        ),
      ]),
    });
