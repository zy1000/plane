/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import type { TProjectRequirement, TRequirementItemStatus } from "@plane/types";
import { ProductChip } from "@/components/products/product-chip";
import { RequirementPeekOverview } from "@/components/requirements/requirement-detail";
import { RequirementService } from "@/services/requirement.service";
import { CycleRequirementsSection } from "./cycle-overview/cycle-requirements-section";

/**
 * 「迭代范围」页里的需求子页。
 *
 * 需求进迭代 = 服务端把 not_started 的需求自动推进到 projected（只升不降），
 * 所以这不只是个展示列表，它是状态流转的入口之一。
 *
 * 数据由页面统一持有（页面还要拿条数喂二级切换条的计数），这里只负责渲染与详情抽屉。
 * 「关联需求」的按钮和弹窗在 header 上 —— 它和「添加工作项」占同一个位置，同一套
 * SWR key 保证 header 关联完这里会自己刷新。
 *
 * 根节点**不要**再套 padding：行的左右缩进由 `Row` 的 px-page-x 提供，套了就会和
 * 工作项子页对不齐。
 */

const requirementService = new RequirementService();

type TProps = {
  workspaceSlug: string;
  projectId: string;
  requirements: TProjectRequirement[];
  isLoading: boolean;
  error: string | null;
  canManage: boolean;
  unlinkingRequirementId: string | null;
  updatingStatusRequirementId: string | null;
  onOpenLinkModal: () => void;
  onUnlink: (requirementId: string) => Promise<void>;
  onStatusChange: (requirementId: string, status: TRequirementItemStatus) => void;
};

export const CycleScopeRequirementsPane = observer(function CycleScopeRequirementsPane(props: TProps) {
  const {
    workspaceSlug,
    projectId,
    requirements,
    isLoading,
    error,
    canManage,
    unlinkingRequirementId,
    updatingStatusRequirementId,
    onOpenLinkModal,
    onUnlink,
    onStatusChange,
  } = props;

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
      <CycleRequirementsSection
        workspaceSlug={workspaceSlug}
        requirements={requirements}
        requirementTypes={requirementTypes}
        isLoading={isLoading}
        error={error}
        canManage={canManage}
        unlinkingRequirementId={unlinkingRequirementId}
        updatingStatusRequirementId={updatingStatusRequirementId}
        onOpenLinkModal={onOpenLinkModal}
        onUnlink={onUnlink}
        onStatusChange={onStatusChange}
        onOpenDetail={setPeekRequirementId}
      />

      {/*
        详情抽屉打到**产品**的端点上：需求内容、版本、变更轨迹的权威都在产品。
        canEdit 恒 false —— 迭代侧对需求内容没有任何写入口，能改的只有需求级交付状态。
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
          productChip={<ProductChip identifier={peekRow.product_identifier} name={peekRow.product_name} />}
        />
      )}
    </div>
  );
});
