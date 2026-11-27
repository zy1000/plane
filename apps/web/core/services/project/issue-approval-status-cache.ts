import {
  ProjectWorkflowService,
  type TTransitionRecord,
} from "@/services/project/project-workflow.service";

const workflowService = new ProjectWorkflowService();

type TApprovalStatusListener = () => void;

const cache = new Map<string, TTransitionRecord[]>();
const inflight = new Map<string, Promise<TTransitionRecord[]>>();
const listeners = new Map<string, Set<TApprovalStatusListener>>();

function getCacheKey(projectId: string, issueId: string) {
  return `${projectId}:${issueId}`;
}

// ── Batch queue ──────────────────────────────────────────────────────────────

const BATCH_DELAY_MS = 50;

type PendingEntry = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  resolve: (value: TTransitionRecord[]) => void;
};

let pendingQueue: PendingEntry[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function processBatch() {
  const batch = pendingQueue;
  pendingQueue = [];
  batchTimer = null;

  const groups = new Map<string, PendingEntry[]>();
  for (const entry of batch) {
    const groupKey = entry.workspaceSlug;
    let group = groups.get(groupKey);
    if (!group) {
      group = [];
      groups.set(groupKey, group);
    }
    group.push(entry);
  }

  for (const [, entries] of groups) {
    const { workspaceSlug } = entries[0];
    const issueIds = [...new Set(entries.map((e) => e.issueId))];

    workflowService
      .fetchWorkspaceBatchIssuePendingRecords(workspaceSlug, issueIds)
      .then((result) => {
        for (const entry of entries) {
          const records = result[entry.issueId] ?? [];
          const key = getCacheKey(entry.projectId, entry.issueId);
          cache.set(key, records);
          inflight.delete(key);
          entry.resolve(records);
        }
      })
      .catch(() => {
        for (const entry of entries) {
          const key = getCacheKey(entry.projectId, entry.issueId);
          inflight.delete(key);
          entry.resolve([]);
        }
      });
  }
}

// ── Public API (unchanged interface) ─────────────────────────────────────────

export async function fetchIssueApprovalStatus(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  skipCache = false
) {
  const key = getCacheKey(projectId, issueId);

  if (!skipCache && cache.has(key)) {
    return cache.get(key) ?? [];
  }

  if (inflight.has(key)) {
    return inflight.get(key)!;
  }

  const promise = new Promise<TTransitionRecord[]>((resolve) => {
    pendingQueue.push({ workspaceSlug, projectId, issueId, resolve });

    if (!batchTimer) {
      batchTimer = setTimeout(processBatch, BATCH_DELAY_MS);
    }
  });

  inflight.set(key, promise);
  return promise;
}

/**
 * 详情开始加载时预取单个工作项，不等攒批：攒批的定时器会被紧接着的整页渲染拖住，
 * 等它触发时详情内容已经出来了，「状态」那块还得再等这一趟。
 */
export function prefetchIssueApprovalStatus(workspaceSlug: string, projectId: string, issueId: string) {
  const request = fetchIssueApprovalStatus(workspaceSlug, projectId, issueId);
  if (batchTimer) {
    clearTimeout(batchTimer);
    processBatch();
  }
  return request;
}

/** 同步读已经取过的结果（没取过返回 undefined）：组件首帧就能知道有没有待审批，不必等一轮异步 */
export function getCachedIssueApprovalStatus(projectId: string, issueId: string) {
  return cache.get(getCacheKey(projectId, issueId));
}

export function subscribeIssueApprovalStatus(
  projectId: string,
  issueId: string,
  listener: TApprovalStatusListener
) {
  const key = getCacheKey(projectId, issueId);
  const currentListeners = listeners.get(key) ?? new Set<TApprovalStatusListener>();
  currentListeners.add(listener);
  listeners.set(key, currentListeners);

  return () => {
    const nextListeners = listeners.get(key);
    if (!nextListeners) return;
    nextListeners.delete(listener);
    if (nextListeners.size === 0) listeners.delete(key);
  };
}

export function invalidateIssueApprovalStatus(projectId: string, issueId: string) {
  const key = getCacheKey(projectId, issueId);
  cache.delete(key);
  inflight.delete(key);
  listeners.get(key)?.forEach((listener) => listener());
}
