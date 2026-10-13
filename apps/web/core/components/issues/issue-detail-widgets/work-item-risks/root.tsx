/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// plane imports
import type { TIssueServiceType } from "@plane/types";
import { Collapsible } from "@plane/ui";
// components
import { useRiskPermissions } from "@/components/risks/permissions";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useWorkItemRisks } from "@/hooks/store/use-work-item-risks";
// local imports
import { WorkItemRisksCollapsibleContent } from "./content";
import { WorkItemRisksCollapsibleTitle } from "./title";
import { useIsDefectWorkItem } from "./use-is-defect-work-item";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

/**
 * 工作项详情的「关联风险」区块。风险 ↔ 缺陷是多对多，这里列出这条缺陷挂的所有风险。
 * 只有类别为「缺陷」的工作项才渲染（非缺陷不请求）；无行时整块不渲染（同关联需求区块），
 * 新增靠快捷操作条。
 */
export const WorkItemRisksCollapsible = observer(function WorkItemRisksCollapsible(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, issueServiceType } = props;
  // store hooks
  const { openWidgets, toggleOpenWidget } = useIssueDetail(issueServiceType);
  const isDefect = useIsDefectWorkItem(workspaceSlug, projectId, issueId, issueServiceType);
  // 非缺陷传空 issueId：hook 不会发请求
  const { risks, unlinkRisk } = useWorkItemRisks(workspaceSlug, projectId, isDefect ? issueId : "");
  // 显式传 ws/pid：peek 可能从工作区级视图打开，靠路由回退会判错项目
  const { canEdit } = useRiskPermissions(workspaceSlug, projectId);
  // derived values
  const isCollapsibleOpen = openWidgets.includes("risks");
  const canManage = !disabled && canEdit;

  if (!isDefect || risks.length === 0) return null;

  return (
    <Collapsible
      isOpen={isCollapsibleOpen}
      onToggle={() => toggleOpenWidget("risks")}
      title={
        <WorkItemRisksCollapsibleTitle
          isOpen={isCollapsibleOpen}
          count={risks.length}
          canManage={canManage}
          issueServiceType={issueServiceType}
        />
      }
      buttonClassName="w-full"
    >
      <WorkItemRisksCollapsibleContent
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        risks={risks}
        onUnlink={canManage ? unlinkRisk : undefined}
      />
    </Collapsible>
  );
});
