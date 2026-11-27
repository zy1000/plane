import { useCallback, useEffect, useState } from "react";
import type { TTransitionRecord } from "@/services/project/project-workflow.service";
import {
  fetchIssueApprovalStatus,
  getCachedIssueApprovalStatus,
  invalidateIssueApprovalStatus,
  subscribeIssueApprovalStatus,
} from "@/services/project/issue-approval-status-cache";

export function useIssueApprovalStatus(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined
) {
  // 列表行等别处取过的结果直接用，首帧就对
  const [initial] = useState(() =>
    projectId && issueId ? getCachedIssueApprovalStatus(projectId, issueId) : undefined
  );
  const [records, setRecords] = useState<TTransitionRecord[]>(initial ?? []);
  const [isLoading, setIsLoading] = useState(false);
  // 第一次结果回来之前还不知道有没有待审批
  const [isLoaded, setIsLoaded] = useState(initial !== undefined);

  const fetch = useCallback(async (skipCache = false) => {
    if (!workspaceSlug || !projectId || !issueId) return;

    setIsLoading(true);
    try {
      const result = await fetchIssueApprovalStatus(workspaceSlug, projectId, issueId, skipCache);
      setRecords(result);
    } finally {
      setIsLoading(false);
      setIsLoaded(true);
    }
  }, [workspaceSlug, projectId, issueId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  useEffect(() => {
    if (!projectId || !issueId) return;

    const unsubscribe = subscribeIssueApprovalStatus(projectId, issueId, () => {
      void fetch(true);
    });

    return unsubscribe;
  }, [projectId, issueId, fetch]);

  const invalidate = useCallback(() => {
    if (!projectId || !issueId) return;
    invalidateIssueApprovalStatus(projectId, issueId);
  }, [projectId, issueId, fetch]);

  return {
    records,
    hasPendingApproval: records.length > 0,
    isLoading,
    isLoaded,
    invalidate,
  };
}
