/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TAvailableTransition } from "@/services/project/project-workflow.service";
import { ProjectWorkflowService } from "@/services/project/project-workflow.service";

const workflowService = new ProjectWorkflowService();

/**
 * 当前用户在这个工作项上能发起的流转（详情页流转按钮）。
 * 状态一变就重新拉：流转边都挂在「当前状态」上。
 */
export function useIssueAvailableTransitions(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined,
  stateId: string | null | undefined,
  enabled = true
) {
  const [transitions, setTransitions] = useState<TAvailableTransition[]>([]);
  // 只认最后一次请求的结果：先发的旧请求晚回来不能盖掉新结果
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    if (!enabled || !workspaceSlug || !projectId || !issueId) {
      setTransitions([]);
      return;
    }
    try {
      const result = await workflowService.fetchIssueAvailableTransitions(workspaceSlug, projectId, issueId);
      if (seq === requestSeq.current) setTransitions(result);
    } catch {
      if (seq === requestSeq.current) setTransitions([]);
    }
  }, [enabled, workspaceSlug, projectId, issueId]);

  useEffect(() => {
    void refresh();
    // 状态变了要按新的出边重拉
  }, [refresh, stateId]);

  return { transitions, refresh };
}
