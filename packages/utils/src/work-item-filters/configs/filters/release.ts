/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { IRelease, TFilterProperty } from "@plane/types";
import { EQUALITY_OPERATOR, COLLECTION_OPERATOR } from "@plane/types";
// local imports
import type { TCreateFilterConfigParams, IFilterIconConfig, TCreateFilterConfig } from "../../../rich-filters";
import { createFilterConfig, getMultiSelectConfig, createOperatorConfigEntry } from "../../../rich-filters";

export type TCreateReleaseFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<undefined> & {
    releases: IRelease[];
  };

export const getReleaseMultiSelectConfig = (params: TCreateReleaseFilterParams) =>
  getMultiSelectConfig<IRelease, string, undefined>(
    {
      items: params.releases,
      getId: (release) => release.id,
      getLabel: (release) => release.name,
      getValue: (release) => release.id,
      getIconData: () => undefined,
    },
    {
      singleValueOperator: EQUALITY_OPERATOR.EXACT,
      ...params,
    },
    {
      ...params,
    }
  );

export const getReleaseFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateReleaseFilterParams> =>
  (params: TCreateReleaseFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "发布",
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getReleaseMultiSelectConfig(updatedParams)
        ),
      ]),
    });
