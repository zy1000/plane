/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import type { ReactNode } from "react";
import type { EIssuesStoreType } from "@plane/types";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";

/** 工作项 peek 需要知道走哪个 issue store；个人主页用 PROFILE，与原工作项页一致 */
export const useIssuesStoreContextValue = (storeType: EIssuesStoreType) =>
  useCallback(
    ({ children }: { children: ReactNode }) => (
      <IssuesStoreContext.Provider value={storeType}>{children}</IssuesStoreContext.Provider>
    ),
    [storeType]
  );
