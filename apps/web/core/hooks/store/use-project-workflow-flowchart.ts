/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { ProjectWorkflowService, type TWorkflowFlowchart } from "@/services/project/project-workflow.service";

const workflowService = new ProjectWorkflowService();

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "error" in error && typeof error.error === "string") return error.error;
  return fallback;
};

/**
 * 拉取项目下「启用中」工作流的流程图聚合数据（只读）。
 * - `hasActiveWorkflow` 供工作项头部决定是否展示入口按钮。
 * - `flowcharts` 供流程图弹框渲染，弹框内部自行管理工作项类型切换。
 */
export const useProjectWorkflowFlowchart = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const [flowcharts, setFlowcharts] = useState<TWorkflowFlowchart[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFlowchart = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await workflowService.fetchWorkflowFlowchart(workspaceSlug, projectId);
      setFlowcharts(data);
    } catch (err) {
      setError(getErrorMessage(err, "获取工作流流程图失败"));
      setFlowcharts([]);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [workspaceSlug, projectId]);

  return {
    flowcharts,
    hasActiveWorkflow: flowcharts.length > 0,
    isLoading,
    hasLoaded,
    error,
    fetchFlowchart,
  };
};
