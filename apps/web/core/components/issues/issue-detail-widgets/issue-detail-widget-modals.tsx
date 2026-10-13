/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import React from "react";
import { observer } from "mobx-react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ISearchIssueResponse, TIssue, TIssueServiceType, TWorkItemWidgets } from "@plane/types";
// components
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { ProjectRequirementLinkModal } from "@/components/requirements/project-requirement-link-modal";
import { RiskSelectModal } from "@/components/risks/risk-select-modal";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { getRiskError } from "@/hooks/store/use-risks";
import { useWorkItemRequirements } from "@/hooks/store/use-work-item-requirements";
import { useWorkItemRisks } from "@/hooks/store/use-work-item-risks";
// plane web imports
import { WorkItemAdditionalWidgetModals } from "@/plane-web/components/issues/issue-detail-widgets/modals";
// local imports
import { IssueLinkCreateUpdateModal } from "../issue-detail/links/create-update-link-modal";
// helpers
import { CreateUpdateIssueModal } from "../issue-modal/modal";
import { useLinkOperations } from "./links/helper";
import { useSubIssueOperations } from "./sub-issues/helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueServiceType: TIssueServiceType;
  hideWidgets?: TWorkItemWidgets[];
};

export const IssueDetailWidgetModals = observer(function IssueDetailWidgetModals(props: Props) {
  const { workspaceSlug, projectId, issueId, issueServiceType, hideWidgets } = props;
  const { t } = useTranslation();
  // store hooks
  const {
    isIssueLinkModalOpen,
    toggleIssueLinkModal: toggleIssueLinkModalStore,
    setIssueLinkData,
    isWorkItemRequirementLinkModalOpen,
    toggleWorkItemRequirementLinkModal,
    isWorkItemRiskLinkModalOpen,
    toggleWorkItemRiskLinkModal,
    isCreateIssueModalOpen,
    toggleCreateIssueModal,
    isSubIssuesModalOpen,
    toggleSubIssuesModal,
    relationKey,
    isRelationModalOpen,
    setRelationKey,
    setLastWidgetAction,
    toggleRelationModal,
    createRelation,
    issueCrudOperationState,
    setIssueCrudOperationState,
  } = useIssueDetail(issueServiceType);

  // helper hooks
  const subIssueOperations = useSubIssueOperations(issueServiceType);
  const handleLinkOperations = useLinkOperations(workspaceSlug, projectId, issueId, issueServiceType);
  // 与「关联需求」折叠区块共用同一个 SWR key，这里 link 成功后区块自动刷新
  const { linkRequirements } = useWorkItemRequirements(workspaceSlug, projectId, issueId);
  // 与「关联风险」区块共用同一个 SWR key，link 成功后区块自动刷新。只在弹窗打开期间挂上
  // issueId：弹窗只有缺陷才打得开，这样非缺陷的工作项不会多发一条会 400 的请求
  const { risks: linkedRisks, linkRisks } = useWorkItemRisks(
    workspaceSlug,
    projectId,
    isWorkItemRiskLinkModalOpen ? issueId : ""
  );

  // handlers
  const handleIssueCrudState = (
    key: "create" | "existing",
    _parentIssueId: string | null,
    issue: TIssue | null = null
  ) => {
    setIssueCrudOperationState({
      ...issueCrudOperationState,
      [key]: {
        toggle: !issueCrudOperationState[key].toggle,
        parentIssueId: _parentIssueId,
        issue: issue,
      },
    });
  };

  const handleExistingIssuesModalClose = () => {
    handleIssueCrudState("existing", null, null);
    setLastWidgetAction("sub-work-items");
    toggleSubIssuesModal(null);
  };

  const handleExistingIssuesModalOnSubmit = async (_issue: ISearchIssueResponse[]) =>
    subIssueOperations.addSubIssue(
      workspaceSlug,
      projectId,
      issueId,
      _issue.map((issue) => issue.id)
    );

  const handleCreateUpdateModalClose = () => {
    handleIssueCrudState("create", null, null);
    toggleCreateIssueModal(false);
    setLastWidgetAction("sub-work-items");
  };

  const handleCreateUpdateModalOnSubmit = async (_issue: TIssue) => {
    if (_issue.parent_id) {
      await subIssueOperations.addSubIssue(workspaceSlug, projectId, _issue.parent_id, [_issue.id]);
    }
  };

  const handleIssueLinkModalOnClose = () => {
    toggleIssueLinkModalStore(false);
    setLastWidgetAction("links");
    setIssueLinkData(null);
  };

  /** 弹窗内失败提示由弹窗自己兜（读 payload.error），这里只管成功后的 toast 与展开区块 */
  const handleWorkItemRequirementLinkSubmit = async (requirementIds: string[]) => {
    await linkRequirements(requirementIds);
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: t("project_requirements.container.toast_linked"),
      message: t("project_requirements.toast.linked", { count: requirementIds.length }),
    });
    setLastWidgetAction("requirements");
  };

  /** 失败在这里 toast（翻 risk.errors.<code>）并把错误抛回去，弹窗据此保持打开 */
  const handleWorkItemRiskLinkSubmit = async (riskIds: string[]) => {
    try {
      await linkRisks(riskIds);
    } catch (error) {
      const { message, code } = getRiskError(error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: code ? t(`risk.errors.${code}`) : message,
      });
      throw error;
    }
    setToast({ type: TOAST_TYPE.SUCCESS, title: t("risk.widget.link_success") });
    setLastWidgetAction("risks");
  };

  const handleRelationOnClose = () => {
    setRelationKey(null);
    toggleRelationModal(null, null);
    setLastWidgetAction("relations");
  };

  const handleExistingIssueModalOnSubmit = async (data: ISearchIssueResponse[]) => {
    if (!relationKey) return;
    if (data.length === 0) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Please select at least one work item.",
      });
      return;
    }

    try {
      await createRelation(
        workspaceSlug,
        projectId,
        issueId,
        relationKey,
        data.map((i) => i.id)
      );

      toggleRelationModal(null, null);
    } catch (error) {
      const currentError = isProjectPermissionError(error)
        ? {
            title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
            message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
              ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
              : undefined,
          }
        : {
            title: t("common.error.label"),
            message: "The relation could not be created",
          };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: currentError.title,
        message: currentError.message,
      });
    }
  };

  // helpers
  const createUpdateModalData: Partial<TIssue> = {
    parent_id: issueCrudOperationState?.create?.parentIssueId,
    project_id: projectId,
  };

  const existingIssuesModalSearchParams = {
    sub_issue: true,
    issue_id: issueCrudOperationState?.existing?.parentIssueId,
  };

  // render conditions
  const shouldRenderExistingIssuesModal =
    !hideWidgets?.includes("sub-work-items") &&
    issueCrudOperationState?.existing?.toggle &&
    issueCrudOperationState?.existing?.parentIssueId &&
    isSubIssuesModalOpen;

  const shouldRenderCreateUpdateModal =
    !hideWidgets?.includes("sub-work-items") &&
    issueCrudOperationState?.create?.toggle &&
    issueCrudOperationState?.create?.parentIssueId &&
    isCreateIssueModalOpen;

  return (
    <>
      {!hideWidgets?.includes("links") && (
        <IssueLinkCreateUpdateModal
          isModalOpen={isIssueLinkModalOpen}
          handleOnClose={handleIssueLinkModalOnClose}
          linkOperations={handleLinkOperations}
          issueServiceType={issueServiceType}
        />
      )}

      {!hideWidgets?.includes("requirements") && (
        <ProjectRequirementLinkModal
          isOpen={isWorkItemRequirementLinkModalOpen}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          excludeIssueId={issueId}
          handleClose={() => toggleWorkItemRequirementLinkModal(false)}
          onSubmit={handleWorkItemRequirementLinkSubmit}
        />
      )}

      {!hideWidgets?.includes("risks") && (
        <RiskSelectModal
          isOpen={isWorkItemRiskLinkModalOpen}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          linkedRiskIds={linkedRisks.map((risk) => risk.id)}
          onClose={() => toggleWorkItemRiskLinkModal(false)}
          onSubmit={handleWorkItemRiskLinkSubmit}
        />
      )}

      {shouldRenderCreateUpdateModal && (
        <CreateUpdateIssueModal
          isOpen={issueCrudOperationState?.create?.toggle}
          data={createUpdateModalData}
          onClose={handleCreateUpdateModalClose}
          onSubmit={handleCreateUpdateModalOnSubmit}
          isProjectSelectionDisabled
        />
      )}

      {shouldRenderExistingIssuesModal && (
        <ExistingIssuesListModal
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          isOpen={issueCrudOperationState?.existing?.toggle}
          handleClose={handleExistingIssuesModalClose}
          searchParams={existingIssuesModalSearchParams}
          handleOnSubmit={handleExistingIssuesModalOnSubmit}
        />
      )}

      {!hideWidgets?.includes("relations") && (
        <ExistingIssuesListModal
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          isOpen={isRelationModalOpen?.issueId === issueId && isRelationModalOpen?.relationType === relationKey}
          handleClose={handleRelationOnClose}
          searchParams={{ issue_relation: true, issue_id: issueId }}
          handleOnSubmit={handleExistingIssueModalOnSubmit}
          workspaceLevelToggle
        />
      )}

      <WorkItemAdditionalWidgetModals
        hideWidgets={hideWidgets ?? []}
        issueServiceType={issueServiceType}
        projectId={projectId}
        workItemId={issueId}
        workspaceSlug={workspaceSlug}
      />
    </>
  );
});
