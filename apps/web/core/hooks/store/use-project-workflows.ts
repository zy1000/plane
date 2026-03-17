/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { ProjectWorkflowService, type TWorkflow, type TWorkflowCreatePayload, type TWorkflowUpdatePayload } from "@/services/project/project-workflow.service";

type TWorkflowsState = {
  // issueTypeId -> workflows map
  workflowsByIssueType: Record<string, TWorkflow[]>;
  loadingIssueTypes: Record<string, boolean>;
};

const workflowService = new ProjectWorkflowService();

export const useProjectWorkflows = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const [state, setState] = useState<TWorkflowsState>({
    workflowsByIssueType: {},
    loadingIssueTypes: {},
  });
  const [error, setError] = useState<string | null>(null);

  const fetchWorkflows = useCallback(
    async (issueTypeId: string) => {
      if (!workspaceSlug || !projectId) return;

      setState((prev) => ({
        ...prev,
        loadingIssueTypes: { ...prev.loadingIssueTypes, [issueTypeId]: true },
      }));
      setError(null);

      try {
        const workflows = await workflowService.fetchWorkflows(workspaceSlug, projectId, issueTypeId);
        setState((prev) => ({
          ...prev,
          workflowsByIssueType: { ...prev.workflowsByIssueType, [issueTypeId]: workflows },
          loadingIssueTypes: { ...prev.loadingIssueTypes, [issueTypeId]: false },
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "获取工作流失败");
        setState((prev) => ({
          ...prev,
          loadingIssueTypes: { ...prev.loadingIssueTypes, [issueTypeId]: false },
        }));
      }
    },
    [workspaceSlug, projectId]
  );

  const createWorkflow = useCallback(
    async (data: TWorkflowCreatePayload): Promise<TWorkflow | undefined> => {
      if (!workspaceSlug || !projectId) return;
      try {
        const workflow = await workflowService.createWorkflow(workspaceSlug, projectId, data);
        setState((prev) => {
          const existing = prev.workflowsByIssueType[data.issue_type_id] ?? [];
          return {
            ...prev,
            workflowsByIssueType: {
              ...prev.workflowsByIssueType,
              [data.issue_type_id]: [workflow, ...existing],
            },
          };
        });
        return workflow;
      } catch (err) {
        throw err;
      }
    },
    [workspaceSlug, projectId]
  );

  const updateWorkflow = useCallback(
    async (issueTypeId: string, data: TWorkflowUpdatePayload): Promise<TWorkflow | undefined> => {
      if (!workspaceSlug || !projectId) return;
      try {
        const updated = await workflowService.updateWorkflow(workspaceSlug, projectId, data);
        setState((prev) => {
          const existing = prev.workflowsByIssueType[issueTypeId] ?? [];
          return {
            ...prev,
            workflowsByIssueType: {
              ...prev.workflowsByIssueType,
              [issueTypeId]: existing.map((w) => (w.id === updated.id ? updated : w)),
            },
          };
        });
        return updated;
      } catch (err) {
        throw err;
      }
    },
    [workspaceSlug, projectId]
  );

  const deleteWorkflow = useCallback(
    async (issueTypeId: string, workflowId: string): Promise<void> => {
      if (!workspaceSlug || !projectId) return;
      try {
        await workflowService.deleteWorkflow(workspaceSlug, projectId, workflowId);
        setState((prev) => {
          const existing = prev.workflowsByIssueType[issueTypeId] ?? [];
          return {
            ...prev,
            workflowsByIssueType: {
              ...prev.workflowsByIssueType,
              [issueTypeId]: existing.filter((w) => w.id !== workflowId),
            },
          };
        });
      } catch (err) {
        throw err;
      }
    },
    [workspaceSlug, projectId]
  );

  const getWorkflowsByIssueTypeId = useCallback(
    (issueTypeId: string): TWorkflow[] => state.workflowsByIssueType[issueTypeId] ?? [],
    [state.workflowsByIssueType]
  );

  const isLoadingForIssueType = useCallback(
    (issueTypeId: string): boolean => state.loadingIssueTypes[issueTypeId] ?? false,
    [state.loadingIssueTypes]
  );

  return {
    fetchWorkflows,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    getWorkflowsByIssueTypeId,
    isLoadingForIssueType,
    error,
  };
};
