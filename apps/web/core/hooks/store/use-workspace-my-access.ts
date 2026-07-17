/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import type { IWorkspaceMyAccess } from "@plane/types";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

export type TUseWorkspaceMyAccess = {
  data: IWorkspaceMyAccess | undefined;
  error: unknown;
  isLoading: boolean;
  refetch: () => void;
};

export function useWorkspaceMyAccess(workspaceSlug: string | undefined): TUseWorkspaceMyAccess {
  const swrKey = workspaceSlug ? `WORKSPACE_MY_ACCESS_${workspaceSlug}` : null;
  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
    workspaceSlug ? () => workspaceService.fetchMyWorkspaceAccess(workspaceSlug) : null,
    { revalidateOnFocus: true }
  );

  return {
    data,
    error,
    isLoading: Boolean(swrKey && isLoading),
    refetch: () => void mutate(),
  };
}
