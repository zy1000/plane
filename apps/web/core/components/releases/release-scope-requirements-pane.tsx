/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY } from "@plane/constants";
import { useUserPermissions } from "@/hooks/store/user";
import { useReleaseRequirements } from "./release-overview/use-release-requirements";
import { ReleaseRequirementsAssociateModal } from "./release-overview/release-requirements-associate-modal";
import { ReleaseRequirementsSection } from "./release-overview/release-requirements-section";

/**
 * 「发布内容」页里的需求子页。
 *
 * 只是把 release-detail-content 里那套（hook + section + 关联弹窗）在这条路由上再挂
 * 一份 —— 两处用的是同一个 SWR key（见 use-release-requirements），所以在任一处关联/
 * 解除，另一处再打开时拿到的是同一份缓存，不会出现两个页面数据打架。
 *
 * 高度：外层给 `min-h-0 flex-1`。section 只有横向滚动（内部 `overflow-x-auto`）且
 * 带 `min-h-[380px]`，纵向靠这一层的 `overflow-y-auto` —— 一次拉 100 条，条数多时
 * 卡片会长，必须有人负责滚。
 */

type TProps = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
  /** 归档的发布单不允许再改关联 */
  isArchived?: boolean;
};

export const ReleaseScopeRequirementsPane = observer(function ReleaseScopeRequirementsPane({
  workspaceSlug,
  projectId,
  releaseId,
  isArchived = false,
}: TProps) {
  const { allowProjectPermissionKeys } = useUserPermissions();
  // 与 release-detail-content.tsx 同一条判定：复用项目侧的需求关联管理权限，不单设 key
  const canManage =
    allowProjectPermissionKeys([PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY], workspaceSlug, projectId) &&
    !isArchived;

  const {
    requirements,
    requirementsLoading,
    requirementsError,
    requirementAssociateOpen,
    unlinkingRequirementId,
    openRequirementAssociateModal,
    closeRequirementAssociateModal,
    handleLinkRequirements,
    handleUnlinkRequirement,
  } = useReleaseRequirements({ workspaceSlug, projectId, releaseId });

  return (
    <div className="h-full w-full overflow-y-auto p-4 vertical-scrollbar scrollbar-sm">
      <ReleaseRequirementsSection
        requirements={requirements}
        requirementsLoading={requirementsLoading}
        requirementsError={requirementsError}
        unlinkingRequirementId={unlinkingRequirementId}
        canManageReleaseRequirements={canManage}
        onOpenRequirementAssociate={openRequirementAssociateModal}
        onUnlinkRequirement={handleUnlinkRequirement}
      />

      <ReleaseRequirementsAssociateModal
        isOpen={requirementAssociateOpen}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        releaseId={releaseId}
        handleClose={closeRequirementAssociateModal}
        onSubmit={handleLinkRequirements}
      />
    </div>
  );
});
