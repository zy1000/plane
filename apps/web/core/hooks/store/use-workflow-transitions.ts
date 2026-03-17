/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import {
  ProjectWorkflowService,
  type TWorkflowTransition,
  type TWorkflowTransitionCreatePayload,
  type TWorkflowTransitionUpdatePayload,
} from "@/services/project/project-workflow.service";

type TTransitionsState = {
  transitions: TWorkflowTransition[];
  isLoading: boolean;
};

const workflowService = new ProjectWorkflowService();

export const useWorkflowTransitions = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  workflowId: string | undefined
) => {
  const [state, setState] = useState<TTransitionsState>({
    transitions: [],
    isLoading: false,
  });
  const [error, setError] = useState<string | null>(null);

  const fetchTransitions = useCallback(async () => {
    if (!workspaceSlug || !projectId || !workflowId) return;
    setState((prev) => ({ ...prev, isLoading: true }));
    setError(null);
    try {
      const data = await workflowService.fetchTransitions(workspaceSlug, projectId, workflowId);
      setState({ transitions: data, isLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取流转配置失败");
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [workspaceSlug, projectId, workflowId]);

  const createTransition = useCallback(
    async (data: TWorkflowTransitionCreatePayload): Promise<TWorkflowTransition | undefined> => {
      if (!workspaceSlug || !projectId || !workflowId) return;
      const created = await workflowService.createTransition(workspaceSlug, projectId, workflowId, data);
      setState((prev) => ({ ...prev, transitions: [...prev.transitions, created] }));
      return created;
    },
    [workspaceSlug, projectId, workflowId]
  );

  const updateTransition = useCallback(
    async (data: TWorkflowTransitionUpdatePayload): Promise<TWorkflowTransition | undefined> => {
      if (!workspaceSlug || !projectId || !workflowId) return;
      const updated = await workflowService.updateTransition(workspaceSlug, projectId, workflowId, data);
      setState((prev) => ({
        ...prev,
        transitions: prev.transitions.map((t) => (t.id === updated.id ? updated : t)),
      }));
      return updated;
    },
    [workspaceSlug, projectId, workflowId]
  );

  const deleteTransition = useCallback(
    async (transitionId: string): Promise<void> => {
      if (!workspaceSlug || !projectId || !workflowId) return;
      await workflowService.deleteTransition(workspaceSlug, projectId, workflowId, transitionId);
      setState((prev) => ({
        ...prev,
        transitions: prev.transitions.filter((t) => t.id !== transitionId),
      }));
    },
    [workspaceSlug, projectId, workflowId]
  );

  return {
    transitions: state.transitions,
    isLoading: state.isLoading,
    error,
    fetchTransitions,
    createTransition,
    updateTransition,
    deleteTransition,
  };
};
