import { useCallback, useEffect, useState } from "react";
import type { TTransitionRecord } from "@/services/project/project-workflow.service";
import {
  fetchIssueApprovalStatus,
  invalidateIssueApprovalStatus,
  subscribeIssueApprovalStatus,
} from "@/services/project/issue-approval-status-cache";

export function useIssueApprovalStatus(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined
) {
  const [records, setRecords] = useState<TTransitionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async (skipCache = false) => {
    if (!workspaceSlug || !projectId || !issueId) return;

    setIsLoading(true);
    try {
      const result = await fetchIssueApprovalStatus(workspaceSlug, projectId, issueId, skipCache);
      setRecords(result);
    } finally {
      setIsLoading(false);
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
    invalidate,
  };
}
