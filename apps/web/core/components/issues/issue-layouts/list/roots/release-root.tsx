/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { EIssuesStoreType } from "@plane/types";
import { useIssues } from "@/hooks/store/use-issues";
import { ReleaseIssueQuickActions } from "../../quick-action-dropdowns/release-issue";
import { BaseListRoot } from "../base-list-root";

export const ReleaseListLayout = observer(function ReleaseListLayout() {
  const { workspaceSlug, projectId, releaseId } = useParams();

  const { issues } = useIssues(EIssuesStoreType.RELEASE);

  return (
    <BaseListRoot
      QuickActions={ReleaseIssueQuickActions}
      addIssuesToView={(issueIds: string[]) => {
        if (!workspaceSlug || !projectId || !releaseId) throw new Error();
        return issues.addIssuesToRelease(workspaceSlug.toString(), projectId.toString(), releaseId.toString(), issueIds);
      }}
      viewId={releaseId?.toString()}
    />
  );
});
