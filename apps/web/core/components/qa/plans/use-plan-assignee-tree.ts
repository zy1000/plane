/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlanService, type TPlanAssigneeTree } from "@/services/qa/plan.service";

type TUsePlanAssigneeTreeArgs = {
  workspaceSlug?: string;
  planId?: string | null;
  enabled: boolean;
};

/** 计划用例「按执行人分组」左侧树的数据源；enabled 为 false 时不请求，refresh 也随之 no-op */
export const usePlanAssigneeTree = ({ workspaceSlug, planId, enabled }: TUsePlanAssigneeTreeArgs) => {
  const planService = useRef(new PlanService()).current;
  const [tree, setTree] = useState<TPlanAssigneeTree | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    if (!enabled || !workspaceSlug || !planId) return;
    setLoading(true);
    try {
      const data = await planService.getPlanAssigneeTree(workspaceSlug, { plan_id: planId });
      setTree(data || null);
    } catch {
      setTree(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, planId, planService, workspaceSlug]);

  useEffect(() => {
    setTree(null);
  }, [planId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tree, loading, refresh };
};
