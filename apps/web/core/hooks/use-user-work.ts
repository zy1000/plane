/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
// constants
import { USER_WORK_LIST, USER_WORK_SUMMARY } from "@/constants/fetch-keys";
// services
import { userWorkService } from "@/services/user-work.service";
// types
import type {
  TUserWorkConfigPatch,
  TUserWorkInitiatedParams,
  TUserWorkPendingParams,
  TUserWorkProcessedParams,
  TUserWorkSummary,
} from "@/types/user-work";

const SWR_OPTIONS = { revalidateOnFocus: false, revalidateIfStale: false, keepPreviousData: true };

/** 页签条数 / 左栏条数 / 快捷筛选条数 / 视图设置，页头与三个视图共用同一份 */
export const useUserWorkSummary = (workspaceSlug?: string, userId?: string, enabled = true) => {
  const key = enabled && workspaceSlug && userId ? USER_WORK_SUMMARY(workspaceSlug, userId) : null;
  const { data, isLoading, mutate } = useSWR<TUserWorkSummary>(
    key,
    () => userWorkService.getSummary(String(workspaceSlug), String(userId)),
    SWR_OPTIONS
  );
  return { summary: data, isLoading, mutate };
};

export const useUserWorkPending = (workspaceSlug?: string, userId?: string, params: TUserWorkPendingParams = {}) => {
  const serialized = JSON.stringify(params);
  const key = workspaceSlug && userId ? USER_WORK_LIST(workspaceSlug, userId, "pending", serialized) : null;
  const { data, isLoading, mutate } = useSWR(
    key,
    () => userWorkService.getPending(String(workspaceSlug), String(userId), params),
    SWR_OPTIONS
  );
  return { data, isLoading, mutate };
};

export const useUserWorkProcessed = (
  workspaceSlug?: string,
  userId?: string,
  params: TUserWorkProcessedParams = {}
) => {
  const serialized = JSON.stringify(params);
  const key = workspaceSlug && userId ? USER_WORK_LIST(workspaceSlug, userId, "processed", serialized) : null;
  const { data, isLoading, mutate } = useSWR(
    key,
    () => userWorkService.getProcessed(String(workspaceSlug), String(userId), params),
    SWR_OPTIONS
  );
  return { data, isLoading, mutate };
};

export const useUserWorkInitiated = (
  workspaceSlug?: string,
  userId?: string,
  params: TUserWorkInitiatedParams = {}
) => {
  const serialized = JSON.stringify(params);
  const key = workspaceSlug && userId ? USER_WORK_LIST(workspaceSlug, userId, "initiated", serialized) : null;
  const { data, isLoading, mutate } = useSWR(
    key,
    () => userWorkService.getInitiated(String(workspaceSlug), String(userId), params),
    SWR_OPTIONS
  );
  return { data, isLoading, mutate };
};

/** 保存视图设置：写回后刷新 summary（里面带 config）并让所有列表缓存失效 */
export const useSaveUserWorkPreferences = (workspaceSlug?: string, userId?: string) => {
  const { mutate } = useSWRConfig();
  return useCallback(
    async (patch: TUserWorkConfigPatch) => {
      if (!workspaceSlug || !userId) return;
      const result = await userWorkService.updatePreferences(workspaceSlug, userId, patch);
      await mutate(
        USER_WORK_SUMMARY(workspaceSlug, userId),
        (current?: TUserWorkSummary) => (current ? { ...current, config: result.config } : current),
        { revalidate: true }
      );
      await mutate((key) => typeof key === "string" && key.startsWith("USER_WORK_") && !key.startsWith("USER_WORK_SUMMARY"));
      return result.config;
    },
    [mutate, userId, workspaceSlug]
  );
};
