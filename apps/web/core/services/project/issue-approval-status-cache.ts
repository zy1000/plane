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

  if (!inflight.has(key)) {
    const promise = workflowService
      .fetchIssuePendingRecords(workspaceSlug, projectId, issueId)
      .then((results) => {
        cache.set(key, results);
        inflight.delete(key);
        return results;
      })
      .catch(() => {
        inflight.delete(key);
        return [] as TTransitionRecord[];
      });
    inflight.set(key, promise);
  }

  return inflight.get(key) ?? [];
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
