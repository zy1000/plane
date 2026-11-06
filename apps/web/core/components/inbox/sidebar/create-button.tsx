/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { PROJECT_INTAKE_VIEW_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
// components
import { InboxIssueCreateModalRoot } from "@/components/inbox/modals/create-modal";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/** 收集侧栏「打开 / 已关闭」页签行右端的新建按钮 */
export const InboxIssueCreateButton = observer(function InboxIssueCreateButton(props: Props) {
  const { workspaceSlug, projectId } = props;
  const [createIssueModal, setCreateIssueModal] = useState(false);
  const { t } = useTranslation();
  const { allowProjectPermissionKeys } = useUserPermissions();
  const { currentProjectDetails } = useProject();

  // 往收件箱提交工作项与后端 IntakeIssueViewSet.create 同一把 key
  const isAuthorized = allowProjectPermissionKeys([PROJECT_INTAKE_VIEW_PERMISSION_KEY]);
  if (!currentProjectDetails?.inbox_view || !isAuthorized) return null;

  return (
    <>
      <InboxIssueCreateModalRoot
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        modalState={createIssueModal}
        handleModalClose={() => setCreateIssueModal(false)}
      />
      <Button variant="primary" size="lg" onClick={() => setCreateIssueModal(true)}>
        {t("add_work_item")}
      </Button>
    </>
  );
});
