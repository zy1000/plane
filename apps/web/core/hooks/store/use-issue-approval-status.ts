import { useCallback, useEffect, useState } from "react";
import {
  ProjectWorkflowService,
  type TTransitionRecord,
} from "@/services/project/project-workflow.service";

const workflowService = new ProjectWorkflowService();

// 模块级缓存，避免同一 issue 重复请求
const cache = new Map<string, TTransitionRecord[]>();
const inflight = new Map<string, Promise<TTransitionRecord[]>>();

function cacheKey(projectId: string, issueId: string) {
  return `${projectId}:${issueId}`;
}

export function useIssueApprovalStatus(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined
) {
  const [records, setRecords] = useState<TTransitionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async (skipCache = false) => {
    if (!workspaceSlug || !projectId || !issueId) return;
    const key = cacheKey(projectId, issueId);

    if (!skipCache && cache.has(key)) {
      setRecords(cache.get(key)!);
      return;
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

    setIsLoading(true);
    const result = await inflight.get(key)!;
    setRecords(result);
    setIsLoading(false);
  }, [workspaceSlug, projectId, issueId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const invalidate = useCallback(() => {
    if (projectId && issueId) cache.delete(cacheKey(projectId, issueId));
    fetch(true);
  }, [projectId, issueId, fetch]);

  return {
    records,
    hasPendingApproval: records.length > 0,
    isLoading,
    invalidate,
  };
}
