/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { PERMISSION_KEYS } from "@plane/constants";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { ProjectIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseKanBanRoot } from "../base-kanban-root";

export const KanBanLayout = observer(function KanBanLayout() {
  // router
  const { workspaceSlug } = useParams();
  // hooks
  const { allowProjectPermissionKeys } = useUserPermissions();
  // derived values
  // 行内改属性：项目里能编辑工作项或缺陷（单条的类型限定以后端为准）
  const canEditPropertiesBasedOnProject = (projectId: string) =>
    allowProjectPermissionKeys(
      [PERMISSION_KEYS.PROJECT_ISSUE_EDIT, PERMISSION_KEYS.PROJECT_DEFECT_EDIT],
      workspaceSlug?.toString(),
      projectId
    );

  return (
    <BaseKanBanRoot
      QuickActions={ProjectIssueQuickActions}
      canEditPropertiesBasedOnProject={canEditPropertiesBasedOnProject}
    />
  );
});
