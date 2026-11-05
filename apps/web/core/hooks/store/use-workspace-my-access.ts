/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import type { IMyAccessProjectPermissions, IWorkspaceMyAccess } from "@plane/types";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

export type TUseWorkspaceMyAccess = {
  data: IWorkspaceMyAccess | undefined;
  error: unknown;
  isLoading: boolean;
  refetch: () => void;
};

/** 工作区设置 › 我的权限：GET my-access/ 的整份结果（身份、可见范围、生效 key、来源） */
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

export type TUseWorkspaceMyProjectAccess = {
  data: IMyAccessProjectPermissions | undefined;
  error: unknown;
  isLoading: boolean;
  refetch: () => void;
};

/**
 * 「我能做什么 › 项目权限」选了具体项目后的结果（GET my-access/projects/<id>/，看不到的项目 403）。
 * projectId 为空不请求；切项目时保留上一份数据让页面淡化过渡，而不是闪骨架。
 */
export function useWorkspaceMyProjectAccess(
  workspaceSlug: string | undefined,
  projectId: string | null
): TUseWorkspaceMyProjectAccess {
  const swrKey = workspaceSlug && projectId ? `WORKSPACE_MY_ACCESS_PROJECT_${workspaceSlug}_${projectId}` : null;
  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
    workspaceSlug && projectId ? () => workspaceService.fetchMyWorkspaceProjectAccess(workspaceSlug, projectId) : null,
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  return {
    data,
    error,
    isLoading: Boolean(swrKey && isLoading),
    refetch: () => void mutate(),
  };
}
