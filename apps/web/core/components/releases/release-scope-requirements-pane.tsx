/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY } from "@plane/constants";
import { ProductChip } from "@/components/products/product-chip";
import { ScopeRequirementsSection } from "@/components/projects/requirements/scope-requirements-section";
import { RequirementPeekOverview } from "@/components/requirements/requirement-detail";
import { useUserPermissions } from "@/hooks/store/user";
import { RequirementService } from "@/services/requirement.service";
import { ReleaseRequirementsAssociateModal } from "./release-overview/release-requirements-associate-modal";
import { useReleaseRequirements } from "./release-overview/use-release-requirements";

/**
 * 「发布内容」页里的需求子页。
 *
 * 版式与迭代「范围 · 需求」对齐：无外层 padding / 卡片头，行用 ScopeRequirementsSection。
 * 关联弹窗在 header 与本 pane 各挂一份（同 SWR key），任一处关联完另一处会跟着刷新。
 *
 * 根节点**不要**再套 padding：行的左右缩进由 `Row` 的 px-page-x 提供，套了就会和
 * 工作项子页对不齐。
 */

const requirementService = new RequirementService();

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
    updatingStatusRequirementId,
    openRequirementAssociateModal,
    closeRequirementAssociateModal,
    handleLinkRequirements,
    handleUnlinkRequirement,
    updateStatus,
  } = useReleaseRequirements({ workspaceSlug, projectId, releaseId });

  const [peekRequirementId, setPeekRequirementId] = useState<string | null>(null);
  const peekRow = useMemo(
    () => requirements.find((row) => row.id === peekRequirementId) ?? null,
    [peekRequirementId, requirements]
  );

  /** 解除关联之后那一行已经不在列表里了，别留一个空抽屉 */
  useEffect(() => {
    if (peekRequirementId && !peekRow) setPeekRequirementId(null);
  }, [peekRequirementId, peekRow]);

  /**
   * 需求类型：列表行首图标 + 详情抽屉自定义字段都靠它。
   * 定义变化不频繁，与列表同生命周期缓存即可。
   */
  const { data: configuration } = useSWR(
    workspaceSlug && projectId ? `project-requirement-configuration-${workspaceSlug}-${projectId}` : null,
    () => requirementService.getProjectRequirementConfiguration(workspaceSlug, projectId)
  );
  const requirementTypes = configuration?.requirement_types ?? [];

  return (
    <div className="flex h-full w-full flex-col">
      <ScopeRequirementsSection
        workspaceSlug={workspaceSlug}
        requirements={requirements}
        requirementTypes={requirementTypes}
        isLoading={requirementsLoading}
        error={requirementsError}
        canManage={canManage}
        unlinkingRequirementId={unlinkingRequirementId}
        updatingStatusRequirementId={updatingStatusRequirementId}
        onOpenLinkModal={openRequirementAssociateModal}
        onUnlink={handleUnlinkRequirement}
        onStatusChange={updateStatus}
        onOpenDetail={setPeekRequirementId}
      />

      {/*
        详情抽屉打到**产品**的端点上：需求内容、版本、变更轨迹的权威都在产品。
        canEdit 恒 false —— 发布侧对需求内容没有任何写入口，能改的只有需求级交付状态。
        与项目需求页同理，「打开整页」隐藏：需求在项目里没有整页路由。
      */}
      {peekRow && (
        <RequirementPeekOverview
          workspaceSlug={workspaceSlug}
          productId={peekRow.product_id ?? ""}
          requirementId={peekRequirementId}
          requirementTypes={requirementTypes}
          rows={requirements}
          canEdit={false}
          onClose={() => setPeekRequirementId(null)}
          onOpenRequirement={setPeekRequirementId}
          showDetailAction={false}
          productChip={
            <ProductChip hideIdentifier identifier={peekRow.product_identifier} name={peekRow.product_name} />
          }
        />
      )}

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
