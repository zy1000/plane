import { useCallback, useState } from "react";
import {
  ProjectWorkflowService,
  type TApprovalActionPayload,
  type TTransitionRecord,
} from "@/services/project/project-workflow.service";

type TApprovalsState = {
  pendingRecords: TTransitionRecord[];
  processedRecords: TTransitionRecord[];
  pendingCount: number;
  isLoading: boolean;
};

const workflowService = new ProjectWorkflowService();

export const useWorkflowApprovals = (
  workspaceSlug: string | undefined,
  projectId: string | undefined
) => {
  const [state, setState] = useState<TApprovalsState>({
    pendingRecords: [],
    processedRecords: [],
    pendingCount: 0,
    isLoading: false,
  });
  const [error, setError] = useState<string | null>(null);

  const fetchPendingApprovals = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setState((prev) => ({ ...prev, isLoading: true }));
    setError(null);
    try {
      const data = await workflowService.fetchMyApprovals(workspaceSlug, projectId, "pending");
      setState((prev) => ({
        ...prev,
        pendingRecords: data.results,
        pendingCount: data.pending_count,
        isLoading: false,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取待审批列表失败");
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [workspaceSlug, projectId]);

  const fetchProcessedApprovals = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setState((prev) => ({ ...prev, isLoading: true }));
    setError(null);
    try {
      const data = await workflowService.fetchMyApprovals(workspaceSlug, projectId, "processed");
      setState((prev) => ({
        ...prev,
        processedRecords: data.results,
        isLoading: false,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取已审批列表失败");
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [workspaceSlug, projectId]);

  const fetchPendingCount = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    try {
      const data = await workflowService.fetchMyApprovals(workspaceSlug, projectId, "pending");
      setState((prev) => ({ ...prev, pendingCount: data.pending_count }));
    } catch {
      // 静默失败，不影响页面
    }
  }, [workspaceSlug, projectId]);

  const submitAction = useCallback(
    async (recordId: string, payload: TApprovalActionPayload): Promise<TTransitionRecord> => {
      if (!workspaceSlug || !projectId) throw new Error("缺少必要参数");
      const updated = await workflowService.submitApprovalAction(workspaceSlug, projectId, recordId, payload);
      // 从 pending 列表移除，刷新计数
      setState((prev) => ({
        ...prev,
        pendingRecords: prev.pendingRecords.filter((r) => r.id !== recordId),
        pendingCount: Math.max(0, prev.pendingCount - 1),
        processedRecords: [updated, ...prev.processedRecords],
      }));
      return updated;
    },
    [workspaceSlug, projectId]
  );

  return {
    pendingRecords: state.pendingRecords,
    processedRecords: state.processedRecords,
    pendingCount: state.pendingCount,
    isLoading: state.isLoading,
    error,
    fetchPendingApprovals,
    fetchProcessedApprovals,
    fetchPendingCount,
    submitAction,
  };
};
