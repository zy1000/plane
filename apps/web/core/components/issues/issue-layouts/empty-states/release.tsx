/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { EUserPermissionsLevel, PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ISearchIssueResponse } from "@plane/types";
import { EIssuesStoreType, EUserProjectRoles } from "@plane/types";
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkItemFilterInstance } from "@/hooks/store/work-item-filters/use-work-item-filter-instance";

export const ReleaseEmptyState = observer(function ReleaseEmptyState() {
  const { workspaceSlug: routerWorkspaceSlug, projectId: routerProjectId, releaseId: routerReleaseId } = useParams();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug.toString() : undefined;
  const projectId = routerProjectId ? routerProjectId.toString() : undefined;
  const releaseId = routerReleaseId ? routerReleaseId.toString() : undefined;
  const [releaseIssuesListModal, setReleaseIssuesListModal] = useState(false);
  const { t } = useTranslation();
  const { issues } = useIssues(EIssuesStoreType.RELEASE);
  const { toggleCreateIssueModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();
  const releaseWorkItemFilter = useWorkItemFilterInstance(EIssuesStoreType.RELEASE, releaseId);
  const canPerformEmptyStateActions = allowPermissions(
    [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  const handleAddIssuesToRelease = async (data: ISearchIssueResponse[]) => {
    if (!workspaceSlug || !projectId || !releaseId) return;

    const issueIds = data.map((i) => i.id);
    await issues
      .addIssuesToRelease(workspaceSlug.toString(), projectId?.toString(), releaseId.toString(), issueIds)
      .then(() =>
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: "Work items added to the release successfully.",
        })
      )
      .catch((error) => {
        if (isProjectPermissionError(error)) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
            message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
              ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
              : undefined,
          });
        } else {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error!",
            message: "Selected work items could not be added to the release. Please try again.",
          });
        }
      });
  };

  return (
    <div className="relative h-full w-full overflow-y-auto">
      <ExistingIssuesListModal
        workspaceSlug={workspaceSlug?.toString()}
        projectId={projectId?.toString()}
        isOpen={releaseIssuesListModal}
        handleClose={() => setReleaseIssuesListModal(false)}
        searchParams={{ search: "" }}
        handleOnSubmit={handleAddIssuesToRelease}
      />
      <div className="grid h-full w-full place-items-center">
        {releaseWorkItemFilter?.hasActiveFilters ? (
          <EmptyStateDetailed
            assetKey="search"
            title={t("common_empty_state.search.title")}
            description={t("common_empty_state.search.description")}
            actions={[
              {
                label: "Clear filters",
                onClick: releaseWorkItemFilter?.clearFilters,
                disabled: !canPerformEmptyStateActions || !releaseWorkItemFilter,
                variant: "secondary",
              },
            ]}
          />
        ) : (
          <EmptyStateDetailed
            assetKey="work-item"
            title={t("project_empty_state.release_work_items.title")}
            description={t("project_empty_state.release_work_items.description")}
            actions={[
              {
                label: t("project_empty_state.release_work_items.cta_primary"),
                onClick: () => {
                  toggleCreateIssueModal(true, EIssuesStoreType.RELEASE);
                },
                disabled: !canPerformEmptyStateActions,
                variant: "primary",
              },
              {
                label: t("project_empty_state.release_work_items.cta_secondary"),
                onClick: () => setReleaseIssuesListModal(true),
                disabled: !canPerformEmptyStateActions,
                variant: "secondary",
              },
            ]}
          />
        )}
      </div>
    </div>
  );
});
