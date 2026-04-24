/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel, PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setPromiseToast, setToast } from "@plane/propel/toast";
import type { TIssue } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
// assets
import emptyIssue from "@/app/assets/empty-state/issue.svg?url";
// components
import { EmptyState } from "@/components/common/empty-state";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// local components
import { IssuePeekOverview } from "../peek-overview";
import { PeekOverviewProperties } from "../peek-overview/properties";
import {
  extractIssueUpdateErrorMessage,
  isWorkflowApprovalInitiated,
  type TIssueWorkflowUpdateError,
} from "../workflow-error-utils";
import { IssueMainContent } from "./main-content";

export type TIssueOperations = {
  fetch: (workspaceSlug: string, projectId: string, issueId: string, loader?: boolean) => Promise<void>;
  update: (workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssue>) => Promise<void>;
  remove: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  archive?: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  restore?: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  addCycleToIssue?: (workspaceSlug: string, projectId: string, cycleId: string, issueId: string) => Promise<void>;
  addIssueToCycle?: (workspaceSlug: string, projectId: string, cycleId: string, issueIds: string[]) => Promise<void>;
  removeIssueFromCycle?: (workspaceSlug: string, projectId: string, cycleId: string, issueId: string) => Promise<void>;
  removeIssueFromModule?: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    issueId: string
  ) => Promise<void>;
  changeModulesInIssue?: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    addModuleIds: string[],
    removeModuleIds: string[]
  ) => Promise<void>;
};

export type TIssueDetailRoot = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  is_archived?: boolean;
};

export const IssueDetailRoot = observer(function IssueDetailRoot(props: TIssueDetailRoot) {
  const { t } = useTranslation();
  const { workspaceSlug, projectId, issueId, is_archived = false } = props;
  // router
  const router = useAppRouter();
  // hooks
  const {
    issue: { getIssueById },
    fetchIssue,
    updateIssue,
    removeIssue,
    archiveIssue,
    addCycleToIssue,
    addIssueToCycle,
    removeIssueFromCycle,
    changeModulesInIssue,
    removeIssueFromModule,
  } = useIssueDetail();
  const {
    issues: { removeIssue: removeArchivedIssue },
  } = useIssues(EIssuesStoreType.ARCHIVED);
  const { allowPermissions } = useUserPermissions();
  const { issueDetailSidebarCollapsed } = useAppTheme();

  const issueOperations: TIssueOperations = useMemo(
    () => ({
      fetch: async (workspaceSlug: string, projectId: string, issueId: string) => {
        try {
          await fetchIssue(workspaceSlug, projectId, issueId);
        } catch (error) {
          console.error("Error fetching the parent issue:", error);
        }
      },
      update: async (workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssue>) => {
        try {
          await updateIssue(workspaceSlug, projectId, issueId, data);
        } catch (error) {
          console.log("Error in updating issue:", error);
          const errorData = error as TIssueWorkflowUpdateError;
          const errorMessage = extractIssueUpdateErrorMessage(errorData);
          const approvalInitiated = isWorkflowApprovalInitiated(errorData);
          setToast({
            title: approvalInitiated ? "已发起审批流程" : t("common.error.label"),
            type: approvalInitiated ? TOAST_TYPE.INFO : TOAST_TYPE.ERROR,
            message:
              errorMessage ??
              (approvalInitiated
                ? "该状态变更需审批人通过后才会生效"
                : t("entity.update.failed", { entity: t("issue.label") })),
          });
        }
      },
      remove: async (workspaceSlug: string, projectId: string, issueId: string) => {
        try {
          if (is_archived) await removeArchivedIssue(workspaceSlug, projectId, issueId);
          else await removeIssue(workspaceSlug, projectId, issueId);
          setToast({
            title: t("common.success"),
            type: TOAST_TYPE.SUCCESS,
            message: t("entity.delete.success", { entity: t("issue.label") }),
          });
        } catch (error) {
          console.log("Error in deleting issue:", error);
          setToast({
            title: t("common.error.label"),
            type: TOAST_TYPE.ERROR,
            message: t("entity.delete.failed", { entity: t("issue.label") }),
          });
        }
      },
      archive: async (workspaceSlug: string, projectId: string, issueId: string) => {
        try {
          await archiveIssue(workspaceSlug, projectId, issueId);
        } catch (error) {
          console.log("Error in archiving issue:", error);
          const currentError = isProjectPermissionError(error)
            ? PROJECT_ERROR_MESSAGES.permissionError
            : {
                i18n_title: "common.error.label",
                i18n_message: "issue.archive.failed.message",
              };
          setToast({
            title: t(currentError.i18n_title),
            type: TOAST_TYPE.ERROR,
            message: currentError.i18n_message ? t(currentError.i18n_message) : undefined,
          });
        }
      },
      addCycleToIssue: async (workspaceSlug: string, projectId: string, cycleId: string, issueId: string) => {
        try {
          await addCycleToIssue(workspaceSlug, projectId, cycleId, issueId);
        } catch (_error) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("common.error.label"),
            message: t("issue.add.cycle.failed"),
          });
        }
      },
      addIssueToCycle: async (workspaceSlug: string, projectId: string, cycleId: string, issueIds: string[]) => {
        try {
          await addIssueToCycle(workspaceSlug, projectId, cycleId, issueIds);
        } catch (_error) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("common.error.label"),
            message: t("issue.add.cycle.failed"),
          });
        }
      },
      removeIssueFromCycle: async (workspaceSlug: string, projectId: string, cycleId: string, issueId: string) => {
        try {
          const removeFromCyclePromise = removeIssueFromCycle(workspaceSlug, projectId, cycleId, issueId);
          setPromiseToast(removeFromCyclePromise, {
            loading: t("issue.remove.cycle.loading"),
            success: {
              title: t("common.success"),
              message: () => t("issue.remove.cycle.success"),
            },
            error: {
              title: t("common.error.label"),
              message: () => t("issue.remove.cycle.failed"),
            },
          });
          await removeFromCyclePromise;
        } catch (error) {
          console.log("Error in removing issue from cycle:", error);
        }
      },
      removeIssueFromModule: async (workspaceSlug: string, projectId: string, moduleId: string, issueId: string) => {
        try {
          const removeFromModulePromise = removeIssueFromModule(workspaceSlug, projectId, moduleId, issueId);
          setPromiseToast(removeFromModulePromise, {
            loading: t("issue.remove.module.loading"),
            success: {
              title: t("common.success"),
              message: () => t("issue.remove.module.success"),
            },
            error: {
              title: t("common.error.label"),
              message: (err: unknown) =>
                isProjectPermissionError(err)
                  ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title)
                  : t("issue.remove.module.failed"),
            },
          });
          await removeFromModulePromise;
        } catch (error) {
          console.log("Error in removing issue from module:", error);
        }
      },
      changeModulesInIssue: async (
        workspaceSlug: string,
        projectId: string,
        issueId: string,
        addModuleIds: string[],
        removeModuleIds: string[]
      ) => {
        try {
          await changeModulesInIssue(workspaceSlug, projectId, issueId, addModuleIds, removeModuleIds);
        } catch (error) {
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
              title: t("common.error.label"),
              message: t("entity.update.failed", { entity: t("issue.label") }),
            });
          }
        }
      },
    }),
    [
      is_archived,
      fetchIssue,
      updateIssue,
      removeIssue,
      archiveIssue,
      removeArchivedIssue,
      addIssueToCycle,
      addCycleToIssue,
      removeIssueFromCycle,
      changeModulesInIssue,
      removeIssueFromModule,
      t,
    ]
  );

  // issue details
  const issue = getIssueById(issueId);
  // checking if issue is editable, based on user role
  const isEditable = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  return (
    <>
      {!issue ? (
        <EmptyState
          image={emptyIssue}
          title={t("issue.empty_state.issue_detail.title")}
          description={t("issue.empty_state.issue_detail.description")}
          primaryButton={{
            text: t("issue.empty_state.issue_detail.primary_button.text"),
            onClick: () => router.push(`/${workspaceSlug}/projects/${projectId}/issues`),
          }}
        />
      ) : (
        <div className="relative flex h-full w-full flex-col overflow-hidden">
          <div className="vertical-scrollbar flex h-full w-full overflow-auto">
            <div className="relative h-full w-full space-y-6 overflow-auto p-4 py-5">
              <IssueMainContent
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                issueOperations={issueOperations}
                isEditable={isEditable}
                isArchived={is_archived}
              />
            </div>
            {!issueDetailSidebarCollapsed && (
              <div
                className={`vertical-scrollbar scrollbar-sm h-full !w-[400px] flex-shrink-0 overflow-hidden border-l border-subtle p-4 py-5 ${
                  is_archived ? "pointer-events-none" : ""
                }`}
              >
                <PeekOverviewProperties
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  issueId={issueId}
                  issueOperations={issueOperations}
                  disabled={!isEditable || is_archived}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* peek overview */}
      <IssuePeekOverview />
    </>
  );
});
