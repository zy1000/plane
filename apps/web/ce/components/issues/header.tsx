/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
// icons
import { Circle, ClipboardCheck } from "lucide-react";
// plane imports
import {
  EUserPermissions,
  EUserPermissionsLevel,
  SPACE_BASE_PATH,
  SPACE_BASE_URL,
  WORK_ITEM_TRACKER_ELEMENTS,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { NewTabIcon, WorkItemsIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { EIssuesStoreType } from "@plane/types";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { CountChip } from "@/components/common/count-chip";
// constants
import { HeaderFilters } from "@/components/issues/filters";
import { WorkflowApprovalModal } from "@/components/issues/workflow-approval-modal";
import { IssueExportModal } from "@/components/issues/export/export-modal";
import { stringifyAppliedFilters } from "@/components/issues/export/utils";
import { ImportIssuesModal } from "@/components/issues/import";
import { useEffect, useMemo, useState } from "react";
// helpers
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useIssues } from "@/hooks/store/use-issues";
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useWorkflowApprovals } from "@/hooks/store/use-workflow-approvals";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { getProjectIssueScopeFromPathname } from "@/store/issue/project";

export const IssuesHeader = observer(function IssuesHeader() {
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const pathname = usePathname();
  const scope = getProjectIssueScopeFromPathname(pathname);
  const { issues, issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  const { selectedEntityIds } = useMultipleSelectStore();
  const { fetchProjectLabels } = useLabel();
  // i18n
  const { t } = useTranslation();

  const refreshAfterImport = async () => {
    if (workspaceSlug && projectId) {
      await fetchProjectLabels(workspaceSlug.toString(), projectId.toString());
    }
    await issues.fetchIssuesWithExistingPagination(
      workspaceSlug?.toString(),
      projectId?.toString(),
      "mutation",
      scope
    );
  };

  const { currentProjectDetails, loader } = useProject();

  const { toggleCreateIssueModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();
  const { isMobile } = usePlatformOS();

  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const { pendingCount, fetchPendingCount } = useWorkflowApprovals(
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  // 页面加载时拉取待审批数量（用于红点）
  useEffect(() => {
    if (workspaceSlug && projectId) {
      fetchPendingCount();
    }
  }, [workspaceSlug, projectId, fetchPendingCount]);

  const filteredQueryString = useMemo(() => {
    if (!projectId) return "";
    const applied = issuesFilter?.appliedFilters;
    return stringifyAppliedFilters(applied as Record<string, unknown> | undefined);
  }, [issuesFilter, projectId, issuesFilter?.appliedFilters]);

  const SPACE_APP_URL = (SPACE_BASE_URL.trim() === "" ? window.location.origin : SPACE_BASE_URL) + SPACE_BASE_PATH;
  const publishedURL = `${SPACE_APP_URL}/issues/${currentProjectDetails?.anchor}`;

  const issuesCount = issues.getGroupIssueCount(undefined, undefined, false);
  const canUserCreateIssue = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  return (
    <Header>
      <Header.LeftItem>
        <div className="flex items-center gap-2.5">
          <Breadcrumbs onBack={() => router.back()} isLoading={loader === "init-loader"} className="flex-grow-0">
            <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label="Work Items"
                  href={`/${workspaceSlug}/projects/${projectId}/issues/`}
                  icon={<WorkItemsIcon className="h-4 w-4 text-tertiary" />}
                  isLast
                />
              }
              isLast
            />
          </Breadcrumbs>
          {issuesCount && issuesCount > 0 ? (
            <Tooltip
              isMobile={isMobile}
              tooltipContent={`There are ${issuesCount} ${issuesCount > 1 ? "work items" : "work item"} in this project`}
              position="bottom"
            >
              <CountChip count={issuesCount} />
            </Tooltip>
          ) : null}
        </div>
        {currentProjectDetails?.anchor ? (
          <a
            href={publishedURL}
            className="group flex items-center gap-1.5 rounded-sm bg-accent-primary/10 px-2.5 py-1 text-11 font-medium text-accent-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Circle className="h-1.5 w-1.5 fill-accent-primary" strokeWidth={2} />
            {t("workspace_projects.network.public.title")}
            <NewTabIcon className="hidden h-3 w-3 group-hover:block" strokeWidth={2} />
          </a>
        ) : (
          <></>
        )}
      </Header.LeftItem>
      <Header.RightItem>
        <div className="hidden items-center gap-2 md:flex">
          <HeaderFilters
            projectId={projectId}
            currentProjectDetails={currentProjectDetails}
            workspaceSlug={workspaceSlug}
            canUserCreateIssue={canUserCreateIssue}
          />
        </div>
        {canUserCreateIssue && (
          <>
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                toggleCreateIssueModal(true, EIssuesStoreType.PROJECT);
              }}
              data-ph-element={WORK_ITEM_TRACKER_ELEMENTS.HEADER_ADD_BUTTON.WORK_ITEMS}
            >
              <div className="block sm:hidden">{t("issue.label", { count: 1 })}</div>
              <div className="hidden sm:block">{t("issue.add.label")}</div>
            </Button>
            <Button size="lg" onClick={() => setIsImportModalOpen(true)} variant="secondary">
              导入
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setIsExportModalOpen(true)}>
              导出
            </Button>
            <div className="relative hidden md:block">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setIsApprovalModalOpen(true)}
                className="flex items-center gap-1"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                {pendingCount > 0 ? (
                  <span style={{ color: "#f87171" }}>
                    待审批·{pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                ) : (
                  "审批"
                )}
              </Button>
            </div>
          </>
        )}
        {isApprovalModalOpen && workspaceSlug && projectId && (
          <WorkflowApprovalModal
            isOpen={isApprovalModalOpen}
            onClose={() => {
              setIsApprovalModalOpen(false);
              fetchPendingCount();
            }}
            workspaceSlug={workspaceSlug.toString()}
            projectId={projectId.toString()}
          />
        )}
        {workspaceSlug && projectId && (
          <IssueExportModal
            open={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            workspaceSlug={workspaceSlug.toString()}
            projectId={projectId.toString()}
            selectedIds={selectedEntityIds}
            filteredQueryString={filteredQueryString}
          />
        )}
        {workspaceSlug && projectId && (
          <ImportIssuesModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            workspaceSlug={workspaceSlug.toString()}
            projectId={projectId.toString()}
            onSuccess={refreshAfterImport}
          />
        )}
      </Header.RightItem>
    </Header>
  );
});
