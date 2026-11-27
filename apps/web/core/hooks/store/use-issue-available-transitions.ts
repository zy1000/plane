/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { prefetchIssueApprovalStatus } from "@/services/project/issue-approval-status-cache";
import type { TAvailableTransition } from "@/services/project/project-workflow.service";
import { ProjectWorkflowService } from "@/services/project/project-workflow.service";

const workflowService = new ProjectWorkflowService();

/** 缓存多久内重新挂载不再请求（抽屉打开时内容会挂载好几次） */
const FRESH_MS = 15_000;
const EMPTY: TAvailableTransition[] = [];

/** stateId：这份结果是本地处在哪个状态时取的；预取时还不知道状态（null），由第一个读到它的组件认领 */
type TCacheEntry = { stateId: string | null; data: TAvailableTransition[]; at: number };
/** 按「项目:工作项」缓存：组件重挂直接用，不从空白等请求 */
const cache = new Map<string, TCacheEntry>();
/** 正在进行的请求：重复挂载、预取之后才挂上来的组件都复用它 */
const inflight = new Map<string, { stateId: string | null; request: Promise<void> }>();
/** 每个工作项最后一次请求的序号：先发的旧请求晚回来不能盖掉新结果 */
const latestSeq = new Map<string, number>();
let seqCounter = 0;
/** 停用中的工作项（编辑中 / 审批中）：期间库里的状态、负责人可能变了，恢复时旧结果和在途请求都不能再用 */
const paused = new Set<string>();

const issueKeyOf = (projectId: string, issueId: string) => `${projectId}:${issueId}`;

/** 这个状态下能用的缓存；预取的结果还没归属状态，够新的话谁先读到算谁的 */
const read = (issueKey: string, stateId: string) => {
  const entry = cache.get(issueKey);
  if (!entry) return undefined;
  if (entry.stateId === null && Date.now() - entry.at <= FRESH_MS) entry.stateId = stateId;
  return entry.stateId === stateId ? entry : undefined;
};

const load = (workspaceSlug: string, projectId: string, issueId: string, stateId: string | null): Promise<void> => {
  const issueKey = issueKeyOf(projectId, issueId);
  const pending = inflight.get(issueKey);
  if (pending && (pending.stateId === null || pending.stateId === stateId)) return pending.request;
  const seq = ++seqCounter;
  latestSeq.set(issueKey, seq);
  const request = workflowService
    .fetchIssueAvailableTransitions(workspaceSlug, projectId, issueId)
    .catch(() => EMPTY)
    .then((data) => {
      if (latestSeq.get(issueKey) === seq) {
        cache.set(issueKey, { stateId, data, at: Date.now() });
        inflight.delete(issueKey);
      }
      // 被后发的请求顶掉、或者期间停用过：这份结果不要，等后发的那个回来
      return inflight.get(issueKey)?.request;
    });
  inflight.set(issueKey, { stateId, request });
  return request;
};

/** 已有结果标成过期（同一状态下先照旧显示，随后重拉）、在途请求作废 */
const invalidate = (issueKey: string) => {
  const entry = cache.get(issueKey);
  if (entry) entry.at = 0;
  inflight.delete(issueKey);
  latestSeq.delete(issueKey);
};

/**
 * 详情开始加载时调，和工作项请求一起发：「状态」那块要用的两份数据——可走的流转、有没有待审批的流转。
 * 那块组件要等工作项回来才挂载，到那时再请求会排在详情页一挂载就发的十几个请求后面，流转按钮比正文晚一拍。
 * 返回的 Promise 在两份数据都到了之后完成（不会失败），调用方可以据此让内容和按钮一起出来。
 */
export const prefetchIssueTransitionData = async (workspaceSlug: string, projectId: string, issueId: string) => {
  const approval = prefetchIssueApprovalStatus(workspaceSlug, projectId, issueId);
  const issueKey = issueKeyOf(projectId, issueId);
  const cached = cache.get(issueKey);
  const settled = paused.has(issueKey) || (cached && Date.now() - cached.at <= FRESH_MS);
  const transitions = settled
    ? undefined
    : (inflight.get(issueKey)?.request ?? load(workspaceSlug, projectId, issueId, null));
  await Promise.all([approval, transitions]);
};

/**
 * 这个工作项从当前状态出发的流转（详情页流转按钮），当前用户不能发起的也在内（can_initiate=false，按钮置灰）。
 * 流转边挂在「当前状态」上，本地状态变了就不再用旧结果。
 * 本地状态先于库变化的时候（编辑中的暂存、提交还没返回）调用方要传 enabled=false：这时请求拿到的是库里旧状态的流转，
 * 会被记到新状态名下。停用期间不请求、返回空；恢复后重拉。
 */
export function useIssueAvailableTransitions(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined,
  stateId: string | null | undefined,
  enabled = true
) {
  const issueKey = workspaceSlug && projectId && issueId ? issueKeyOf(projectId, issueId) : null;
  const state = stateId ?? "";
  // 数据一律从模块缓存读，这个计数只负责在请求回来后触发重渲染
  const [, setVersion] = useState(0);
  // 权限还没就绪时的「未启用」不算停用，否则会把预取的结果作废掉
  const wasEnabled = useRef(false);

  useEffect(() => {
    if (!issueKey || !workspaceSlug || !projectId || !issueId) return;
    if (!enabled) {
      if (wasEnabled.current) paused.add(issueKey);
      return;
    }
    wasEnabled.current = true;
    if (paused.delete(issueKey)) invalidate(issueKey);
    const cached = read(issueKey, state);
    if (cached && Date.now() - cached.at <= FRESH_MS) return;
    let active = true;
    void load(workspaceSlug, projectId, issueId, state).then(() => {
      if (active) setVersion((version) => version + 1);
    });
    return () => {
      active = false;
    };
  }, [enabled, issueKey, state, workspaceSlug, projectId, issueId]);

  const transitions = (enabled && issueKey && read(issueKey, state)?.data) || EMPTY;
  return { transitions };
}
