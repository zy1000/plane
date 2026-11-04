/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { PERMISSION_KEYS } from "@plane/constants";
import { EIssuesStoreType } from "@plane/types";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
// types
import { CycleIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseListRoot } from "../base-list-root";

export const CycleListLayout = observer(function CycleListLayout() {
  const { workspaceSlug, projectId, cycleId } = useParams();
  // store
  const { issues } = useIssues(EIssuesStoreType.CYCLE);
  const { currentProjectCompletedCycleIds } = useCycle(); // mobx store
  const { allowProjectPermissionKeys } = useUserPermissions();

  const isCompletedCycle =
    cycleId && currentProjectCompletedCycleIds ? currentProjectCompletedCycleIds.includes(cycleId.toString()) : false;
  // 拖拽 / 行内改属性：项目里能编辑工作项或缺陷（单条的类型限定以后端为准）
  const isEditingAllowed = allowProjectPermissionKeys([PERMISSION_KEYS.PROJECT_ISSUE_EDIT, PERMISSION_KEYS.PROJECT_DEFECT_EDIT]);

  const canEditIssueProperties = useCallback(() => isEditingAllowed, [isEditingAllowed]);

  const addIssuesToView = useCallback(
    (issueIds: string[]) => {
      if (!workspaceSlug || !projectId || !cycleId) throw new Error();
      return issues.addIssueToCycle(workspaceSlug.toString(), projectId.toString(), cycleId.toString(), issueIds);
    },
    [issues?.addIssueToCycle, workspaceSlug, projectId, cycleId]
  );

  return (
    <BaseListRoot
      QuickActions={CycleIssueQuickActions}
      addIssuesToView={addIssuesToView}
      canEditPropertiesBasedOnProject={canEditIssueProperties}
      isCompletedCycle={isCompletedCycle}
      viewId={cycleId?.toString()}
    />
  );
});
