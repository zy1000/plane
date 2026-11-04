/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// hooks
import { PERMISSION_KEYS } from "@plane/constants";
import { useCycle } from "@/hooks/store/use-cycle";
import { useUserPermissions } from "@/hooks/store/user";
// components
import { CycleIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseSpreadsheetRoot } from "../base-spreadsheet-root";

export const CycleSpreadsheetLayout = observer(function CycleSpreadsheetLayout() {
  // router
  const { cycleId } = useParams();
  // store hooks
  const { currentProjectCompletedCycleIds } = useCycle();
  const { allowProjectPermissionKeys } = useUserPermissions();
  // auth
  const isCompletedCycle =
    cycleId && currentProjectCompletedCycleIds ? currentProjectCompletedCycleIds.includes(cycleId.toString()) : false;
  // 拖拽 / 行内改属性：项目里能编辑工作项或缺陷（单条的类型限定以后端为准）
  const isEditingAllowed = allowProjectPermissionKeys([PERMISSION_KEYS.PROJECT_ISSUE_EDIT, PERMISSION_KEYS.PROJECT_DEFECT_EDIT]);

  const canEditIssueProperties = useCallback(() => isEditingAllowed, [isEditingAllowed]);

  if (!cycleId) return null;

  return (
    <BaseSpreadsheetRoot
      QuickActions={CycleIssueQuickActions}
      canEditPropertiesBasedOnProject={canEditIssueProperties}
      isCompletedCycle={isCompletedCycle}
      viewId={cycleId.toString()}
    />
  );
});
