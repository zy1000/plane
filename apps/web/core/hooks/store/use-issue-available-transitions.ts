/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import type { TAvailableTransition } from "@/services/project/project-workflow.service";
import { ProjectWorkflowService } from "@/services/project/project-workflow.service";

const workflowService = new ProjectWorkflowService();

/** 缓存多久内重新挂载不再请求（抽屉打开时内容会挂载好几次） */
const FRESH_MS = 15_000;
const EMPTY: TAvailableTransition[] = [];

type TCacheEntry = { data: TAvailableTransition[]; at: number };
/** 按「项目:工作项:当前状态」缓存：组件重挂直接用，不从空白等请求 */
const cache = new Map<string, TCacheEntry>();
/** 同一个 key 正在进行的请求，重复挂载时复用 */
const inflight = new Map<string, Promise<TAvailableTransition[]>>();
/** 每个 key 最后一次请求的序号：先发的旧请求晚回来不能盖掉新结果 */
const latestSeq = new Map<string, number>();
let seqCounter = 0;

const load = (key: string, workspaceSlug: string, projectId: string, issueId: string, force: boolean) => {
  const pending = inflight.get(key);
  if (pending && !force) return pending;
  const seq = ++seqCounter;
  latestSeq.set(key, seq);
  const request = workflowService
    .fetchIssueAvailableTransitions(workspaceSlug, projectId, issueId)
    .catch(() => EMPTY)
    .then((data) => {
      if (latestSeq.get(key) === seq) {
        cache.set(key, { data, at: Date.now() });
        inflight.delete(key);
      }
      return cache.get(key)?.data ?? data;
    });
  inflight.set(key, request);
  return request;
};

/**
 * 这个工作项从当前状态出发的流转（详情页流转按钮），当前用户不能发起的也在内（can_initiate=false，按钮置灰）。
 * 流转边挂在「当前状态」上，状态变了按新 key 取；refresh() 强制按库里最新的重拉（改完状态后调用）。
 */
export function useIssueAvailableTransitions(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined,
  stateId: string | null | undefined,
  enabled = true
) {
  const key = enabled && workspaceSlug && projectId && issueId ? `${projectId}:${issueId}:${stateId ?? ""}` : null;
  const [result, setResult] = useState<{ key: string | null; data: TAvailableTransition[] }>(() => ({
    key,
    data: (key && cache.get(key)?.data) || EMPTY,
  }));

  const fetchFor = useCallback(
    async (force: boolean) => {
      if (!key || !workspaceSlug || !projectId || !issueId) return;
      const data = await load(key, workspaceSlug, projectId, issueId, force);
      setResult((prev) => (prev.key === key ? { key, data } : prev));
    },
    [key, workspaceSlug, projectId, issueId]
  );

  useEffect(() => {
    if (!key) {
      setResult({ key, data: EMPTY });
      return;
    }
    const cached = cache.get(key);
    setResult({ key, data: cached?.data ?? EMPTY });
    if (!cached || Date.now() - cached.at > FRESH_MS) void fetchFor(false);
  }, [key, fetchFor]);

  const refresh = useCallback(() => fetchFor(true), [fetchFor]);

  // key 刚变、effect 还没跑的那一帧也直接用缓存
  const transitions = result.key === key ? result.data : (key && cache.get(key)?.data) || EMPTY;
  return { transitions, refresh };
}
