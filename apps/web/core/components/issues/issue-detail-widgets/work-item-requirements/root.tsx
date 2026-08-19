/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// plane imports
import { PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY } from "@plane/constants";
import type { TIssueServiceType } from "@plane/types";
import { Collapsible } from "@plane/ui";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useWorkItemRequirements } from "@/hooks/store/use-work-item-requirements";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { WorkItemRequirementsCollapsibleContent } from "./content";
import { WorkItemRequirementsCollapsibleTitle } from "./title";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

/**
 * 工作项详情的「关联需求」区块。需求 ↔ 工作项是多对多，这里列出这条工作项挂的所有需求。
 * 无行时整块不渲染（与 sub-work-items / relations 等 widget 一致），新增靠快捷操作条。
 */
export const WorkItemRequirementsCollapsible = observer(function WorkItemRequirementsCollapsible(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, issueServiceType } = props;
  // store hooks
  const { openWidgets, toggleOpenWidget } = useIssueDetail(issueServiceType);
  const { allowProjectPermissionKeys } = useUserPermissions();
  const { requirements, unlinkRequirement } = useWorkItemRequirements(workspaceSlug, projectId, issueId);
  // derived values
  const isCollapsibleOpen = openWidgets.includes("requirements");
  // 显式传 ws/pid：peek 可能从工作区级视图打开，靠路由回退会判错项目
  const canManage =
    !disabled && allowProjectPermissionKeys([PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY], workspaceSlug, projectId);

  if (requirements.length === 0) return null;

  return (
    <Collapsible
      isOpen={isCollapsibleOpen}
      onToggle={() => toggleOpenWidget("requirements")}
      title={
        <WorkItemRequirementsCollapsibleTitle
          isOpen={isCollapsibleOpen}
          count={requirements.length}
          canManage={canManage}
          issueServiceType={issueServiceType}
        />
      }
      buttonClassName="w-full"
    >
      <WorkItemRequirementsCollapsibleContent
        requirements={requirements}
        onUnlink={canManage ? unlinkRequirement : undefined}
      />
    </Collapsible>
  );
});
