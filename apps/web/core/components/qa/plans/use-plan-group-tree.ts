/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlanService, isPlanCaseEnumGroupBy, type TPlanGroupTree } from "@/services/qa/plan.service";
import type { TPlanCaseGroupBy } from "./plan-case-display-filters";

type TUsePlanGroupTreeArgs = {
  workspaceSlug?: string;
  planId?: string | null;
  groupBy: TPlanCaseGroupBy;
};

/**
 * 计划用例「按类型 / 优先级 / 执行结果分组」左侧树的数据源；
 * groupBy 不是枚举分组维度时不请求，refresh 也随之 no-op
 */
export const usePlanGroupTree = ({ workspaceSlug, planId, groupBy }: TUsePlanGroupTreeArgs) => {
  const planService = useRef(new PlanService()).current;
  const [tree, setTree] = useState<TPlanGroupTree | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    if (!workspaceSlug || !planId || !isPlanCaseEnumGroupBy(groupBy)) return;
    setLoading(true);
    try {
      const data = await planService.getPlanGroupTree(workspaceSlug, { plan_id: planId, group_by: groupBy });
      setTree(data || null);
    } catch {
      setTree(null);
    } finally {
      setLoading(false);
    }
  }, [groupBy, planId, planService, workspaceSlug]);

  useEffect(() => {
    setTree(null);
  }, [planId, groupBy]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tree, loading, refresh };
};
