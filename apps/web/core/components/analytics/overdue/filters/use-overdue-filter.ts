/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo } from "react";
import { FilterInstance } from "@plane/shared-state";
import type { TFilterConfig } from "@plane/types";
import { overdueFiltersAdapter } from "./adapter";
import type { TOverdueFilterExpression, TOverdueFilterProperty } from "./types";

type TUseOverdueFilterProps = {
  areAllConfigsInitialized: boolean;
  configs: TFilterConfig<TOverdueFilterProperty>[];
};

export const useOverdueFilter = ({ areAllConfigsInitialized, configs }: TUseOverdueFilterProps) => {
  const filter = useMemo(
    () =>
      new FilterInstance<TOverdueFilterProperty, TOverdueFilterExpression>({
        adapter: overdueFiltersAdapter,
        initialExpression: {},
      }),
    []
  );

  useEffect(() => {
    filter.configManager.registerAll(configs);
    filter.configManager.setAreConfigsReady(areAllConfigsInitialized);
  }, [areAllConfigsInitialized, configs, filter]);

  return filter;
};
