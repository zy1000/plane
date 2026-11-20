/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { NotifyService } from "@/services/notify.service";
import type {
  TNotifyEntityType,
  TNotifyMode,
  TNotifyScopeEntityType,
  TNotifySubscriber,
  TNotifySubscribersResponse,
} from "@/types/notify";

const notifyService = new NotifyService();

export const getNotifySubscribersKey = (
  workspaceSlug: string,
  projectId: string,
  entityType: TNotifyEntityType,
  entityId: string
) => `notify-subscribers-${workspaceSlug}-${projectId}-${entityType}-${entityId}`;

export const getNotifyScopeKey = (
  workspaceSlug: string,
  projectId: string,
  entityType: TNotifyScopeEntityType,
  entityId: string
) => `notify-scope-${workspaceSlug}-${projectId}-${entityType}-${entityId}`;

/**
 * 对象（发布、迭代等）上的订阅人。增删改都拿接口返回的最新名单整块替换，
 * 并让同一对象的「通知对象」区块重新取数。
 */
export const useNotifySubscribers = (
  workspaceSlug: string,
  projectId: string,
  entityType: TNotifyEntityType,
  entityId: string
) => {
  const ready = Boolean(workspaceSlug && projectId && entityId);
  const { data, isLoading, mutate } = useSWR(
    ready ? getNotifySubscribersKey(workspaceSlug, projectId, entityType, entityId) : null,
    () => notifyService.listSubscribers(workspaceSlug, projectId, entityType, entityId),
    // 出错（无权限等）时区块静默不渲染，别按全局配置重试
    { shouldRetryOnError: false }
  );

  const subscribers: TNotifySubscriber[] = useMemo(() => data?.subscribers ?? [], [data]);

  const apply = useCallback(
    async (next: TNotifySubscribersResponse) => {
      await mutate((current) => ({ ...current, subscribers: next.subscribers }), { revalidate: false });
      void globalMutate(getNotifyScopeKey(workspaceSlug, projectId, entityType, entityId));
    },
    [entityId, entityType, mutate, projectId, workspaceSlug]
  );

  const addSubscribers = useCallback(
    async (subscriberIds: string[], mode: TNotifyMode) => {
      if (!ready || subscriberIds.length === 0) return;
      await apply(
        await notifyService.addSubscribers(workspaceSlug, projectId, {
          entity_type: entityType,
          entity_id: entityId,
          subscriber_ids: subscriberIds,
          mode,
        })
      );
    },
    [apply, entityId, entityType, projectId, ready, workspaceSlug]
  );

  const updateSubscriber = useCallback(
    async (rowId: string, mode: TNotifyMode) => {
      if (!ready) return;
      await apply(await notifyService.updateSubscriber(workspaceSlug, projectId, rowId, mode));
    },
    [apply, projectId, ready, workspaceSlug]
  );

  const removeSubscriber = useCallback(
    async (rowId: string) => {
      if (!ready) return;
      await apply(await notifyService.removeSubscriber(workspaceSlug, projectId, rowId));
    },
    [apply, projectId, ready, workspaceSlug]
  );

  return {
    subscribers,
    canManage: data?.can_manage ?? false,
    isLoading,
    addSubscribers,
    updateSubscriber,
    removeSubscriber,
  };
};

/**
 * 这个对象的邮件即时发给谁、进谁的每日摘要（只读）。
 * `revision` 传一个随对象上人员变化的值（如负责人 + 成员 id 拼起来），变了就重新取。
 */
export const useNotifyScope = (
  workspaceSlug: string,
  projectId: string,
  entityType: TNotifyScopeEntityType,
  entityId: string,
  revision?: string
) => {
  const ready = Boolean(workspaceSlug && projectId && entityId);
  const { data, mutate } = useSWR(
    ready ? getNotifyScopeKey(workspaceSlug, projectId, entityType, entityId) : null,
    () => notifyService.scope(workspaceSlug, projectId, entityType, entityId),
    { shouldRetryOnError: false }
  );
  // 首次挂载由 useSWR 自己取数；之后 revision 变了才重新取
  const lastRevision = useRef(revision);
  useEffect(() => {
    if (lastRevision.current === revision) return;
    lastRevision.current = revision;
    void mutate();
  }, [mutate, revision]);
  return { scope: data };
};
