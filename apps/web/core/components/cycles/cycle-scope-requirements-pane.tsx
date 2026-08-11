/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY } from "@plane/constants";
import { useCycle } from "@/hooks/store/use-cycle";
import { useUserPermissions } from "@/hooks/store/user";
import { CycleRequirementLinkModal } from "./cycle-overview/cycle-requirement-link-modal";
import { CycleRequirementsSection } from "./cycle-overview/cycle-requirements-section";
import { useCycleRequirements } from "./cycle-overview/use-cycle-requirements";

/**
 * 「迭代范围」页里的需求子页。
 *
 * 这三件套（hook + section + 关联弹窗）原本挂在 cycle-overview-content.tsx 上，而那个
 * 文件自 2026-06-02 起就不再被任何路由引用（迭代概览走的是 cycle-display-content.tsx），
 * 于是整个功能在 UI 上不可达。现已把它接到真正活着的这条路由上，那个孤儿文件也一并删除
 * —— 它孤儿化之后还被例行维护过三次，留着迟早还会有人往里写。
 *
 * 需求进迭代 = 阶段升到「已排期」（服务端 recalculate_stage 按关联事实派生），
 * 所以这不只是个展示列表，它是阶段流转的入口之一。
 */

type TProps = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};

export const CycleScopeRequirementsPane = observer(function CycleScopeRequirementsPane({
  workspaceSlug,
  projectId,
  cycleId,
}: TProps) {
  const { allowProjectPermissionKeys } = useUserPermissions();
  const { getCycleById } = useCycle();
  // 归档的迭代不允许再改关联
  const isCycleArchived = Boolean(getCycleById(cycleId)?.archived_at);
  const canManage =
    allowProjectPermissionKeys([PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY], workspaceSlug, projectId) &&
    !isCycleArchived;

  const {
    cycleRequirements,
    requirementsLoading,
    requirementsError,
    linkModalOpen,
    unlinkingRequirementId,
    openLinkModal,
    closeLinkModal,
    linkRequirements,
    unlinkRequirement,
  } = useCycleRequirements({ workspaceSlug, projectId, cycleId });

  // CycleRequirementsSection 根节点是 `flex h-full min-h-0 flex-col`，自己管滚动。
  // 外面**不要**再套 overflow-y-auto，否则会出现两条滚动条。
  return (
    <div className="h-full w-full p-4">
      <CycleRequirementsSection
        requirements={cycleRequirements}
        isLoading={requirementsLoading}
        error={requirementsError}
        canManage={canManage}
        unlinkingRequirementId={unlinkingRequirementId}
        onOpenLinkModal={openLinkModal}
        onUnlink={unlinkRequirement}
      />

      <CycleRequirementLinkModal
        isOpen={linkModalOpen}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
        handleClose={closeLinkModal}
        onSubmit={linkRequirements}
      />
    </div>
  );
});
