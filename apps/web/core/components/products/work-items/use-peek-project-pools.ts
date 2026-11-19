/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import { useCycle } from "@/hooks/store/use-cycle";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useProjectProduct } from "@/hooks/store/use-project-product";
import { useProjectStage } from "@/hooks/store/use-project-stage";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useRelease } from "@/hooks/store/use-release";

/**
 * 工作项详情抽屉右栏（标签 / 迭代 / 发布 / 产品 / 产品模块 / 阶段 / 状态 / 负责人）显示当前值时直接读项目级 store，
 * 这些 store 平时由 project-wrapper 在进项目时预热。产品页不在项目路由下，打开抽屉前按工作项所属项目补拉一次，
 * 否则会显示成「无产品」「无阶段」。每个项目只拉一次。
 */
export const usePeekProjectPools = (workspaceSlug: string, projectId: string | undefined) => {
  const { fetchProjectLabels } = useLabel();
  const { fetchProjectStates } = useProjectState();
  const {
    project: { fetchProjectMembers },
  } = useMember();
  const { fetchAllCycles } = useCycle();
  const { fetchReleases } = useRelease();
  const { fetchProjectProductModules } = useProjectProduct();
  const { fetchStages } = useProjectStage();

  useSWR(
    workspaceSlug && projectId ? ["product-work-items-peek-pools", workspaceSlug, projectId] : null,
    async () => {
      if (!projectId) return;
      await Promise.allSettled([
        fetchProjectLabels(workspaceSlug, projectId),
        fetchProjectStates(workspaceSlug, projectId),
        fetchProjectMembers(workspaceSlug, projectId),
        fetchAllCycles(workspaceSlug, projectId),
        fetchReleases(workspaceSlug, projectId),
        fetchProjectProductModules(workspaceSlug, projectId),
        fetchStages(workspaceSlug, projectId),
      ]);
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
};
