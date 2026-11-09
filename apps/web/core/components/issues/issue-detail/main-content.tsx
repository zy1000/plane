/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import type { TNameDescriptionLoader } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import { getTextContent } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import useSize from "@/hooks/use-window-size";
// plane web components
import { DeDupeIssuePopoverRoot } from "@/plane-web/components/de-dupe/duplicate-popover";
import { useDebouncedDuplicateIssues } from "@/plane-web/hooks/use-debounced-duplicate-issues";
// local imports
import { IssueDetailWidgets } from "../issue-detail-widgets";
import { PeekOverviewCorePropertyBar } from "../peek-overview/core-property-bar";
import { PeekOverviewProperties } from "../peek-overview/properties";
import { IssueTitleInput } from "../title-input";
import { IssueDescriptionSection } from "./description-section";
import { IssueExtraFieldsSection } from "./extra-fields-section";
import { IssueActivity } from "./issue-activity";
import { IssueParentDetail } from "./parent";
import type { TIssueOperations } from "./root";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  /** 有编辑权限（决定附件 / 子项等即时操作区能不能用） */
  isEditable: boolean;
  isArchived: boolean;
  /** 处于编辑会话中（点了「编辑」且不在保存中）：标题 / 描述 / 属性 / 自定义字段才可改 */
  isEditing: boolean;
  /** 取消编辑后变化，让标题 / 描述编辑器重挂回到保存前的值 */
  sessionKey: number;
  editorRef: React.RefObject<EditorRefApi>;
  isSubmitting: TNameDescriptionLoader;
  setIsSubmitting: (value: TNameDescriptionLoader) => void;
  onTitleChange: (value: string) => void;
  onEdit?: () => void;
};

export const IssueMainContent = observer(function IssueMainContent(props: Props) {
  const {
    workspaceSlug,
    projectId,
    issueId,
    issueOperations,
    isEditable,
    isArchived,
    isEditing,
    sessionKey,
    editorRef,
    isSubmitting,
    setIsSubmitting,
    onTitleChange,
    onEdit,
  } = props;
  // hooks
  const windowSize = useSize();
  const {
    issue: { getIssueById },
    peekIssue,
  } = useIssueDetail();
  const { getProjectById } = useProject();
  // derived values
  const projectDetails = getProjectById(projectId);
  const issue = issueId ? getIssueById(issueId) : undefined;
  const canEdit = isEditable && !isArchived;
  // 非编辑态一律只读；离开提醒由编辑会话统一负责
  const fieldsDisabled = !canEdit || !isEditing;
  // debounced duplicate issues swr
  const { duplicateIssues } = useDebouncedDuplicateIssues(
    workspaceSlug,
    projectDetails?.workspace.toString(),
    projectDetails?.id,
    {
      name: issue?.name,
      description_html: getTextContent(issue?.description_html),
      issueId: issue?.id,
    }
  );

  useEffect(() => {
    if (isSubmitting === "submitted") {
      setTimeout(async () => setIsSubmitting("saved"), 2000);
    }
  }, [isSubmitting, setIsSubmitting]);

  if (!issue || !issue.project_id) return <></>;

  const isPeekModeActive = Boolean(peekIssue);

  return (
    <>
      <div className="min-w-0 space-y-6">
        <IssueParentDetail
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          issue={issue}
          issueOperations={issueOperations}
          disabled={fieldsDisabled}
        />

        {duplicateIssues?.length > 0 && (
          <div className="flex justify-end">
            <DeDupeIssuePopoverRoot
              workspaceSlug={workspaceSlug}
              projectId={issue.project_id}
              rootIssueId={issueId}
              issues={duplicateIssues}
              issueOperations={issueOperations}
              renderDeDupeActionModals={!isPeekModeActive}
            />
          </div>
        )}

        <IssueTitleInput
          key={`${issue.id}-${sessionKey}`}
          workspaceSlug={workspaceSlug}
          projectId={issue.project_id}
          issueId={issue.id}
          isSubmitting={isSubmitting}
          setIsSubmitting={(value) => setIsSubmitting(value)}
          issueOperations={issueOperations}
          disabled={fieldsDisabled}
          value={issue.name}
          onChange={onTitleChange}
        />

        <div>
          <PeekOverviewCorePropertyBar
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            issueOperations={issueOperations}
            disabled={fieldsDisabled}
            dimmed={!canEdit}
          />
        </div>

        <IssueDescriptionSection
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          issueOperations={issueOperations}
          editorRef={editorRef}
          isEditable={isEditable}
          isArchived={isArchived}
          isEditing={isEditing}
          sessionKey={sessionKey}
          setIsSubmitting={setIsSubmitting}
          onEdit={onEdit}
        />

        <IssueExtraFieldsSection
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          issueOperations={issueOperations}
          disabled={fieldsDisabled}
          dimmed={!canEdit}
        />
      </div>

      <IssueDetailWidgets
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        disabled={!isEditable || isArchived}
        renderWidgetModals={!isPeekModeActive}
        issueServiceType={EIssueServiceType.ISSUES}
      />

      {windowSize[0] < 768 && (
        <PeekOverviewProperties
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          issueOperations={issueOperations}
          disabled={fieldsDisabled}
          dimmed={!canEdit}
          basicGroup={false}
        />
      )}

      <IssueActivity workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} disabled={isArchived} />
    </>
  );
});
