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
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local components
import type { TIssueOperations } from "../issue-detail";
import { IssueExtraFieldsSection } from "../issue-detail/extra-fields-section";
import { IssueParentDetail } from "../issue-detail/parent";
import { IssueTitleInput } from "../title-input";
import { IssueDescriptionSection } from "../issue-detail/description-section";
import { PeekOverviewCorePropertyBar } from "./core-property-bar";

type Props = {
  editorRef: React.RefObject<EditorRefApi>;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled: boolean;
  isArchived: boolean;
  isSubmitting: TNameDescriptionLoader;
  setIsSubmitting: (value: TNameDescriptionLoader) => void;
  /** 处于编辑会话中（点了「编辑」且不在保存中）：标题 / 描述 / 属性 / 自定义字段才可改 */
  isEditing: boolean;
  /** 取消编辑后变化，让标题 / 描述编辑器重挂回到保存前的值 */
  sessionKey: number;
  onTitleChange: (value: string) => void;
  onEdit?: () => void;
};

export const PeekOverviewIssueDetails = observer(function PeekOverviewIssueDetails(props: Props) {
  const {
    editorRef,
    workspaceSlug,
    projectId,
    issueId,
    issueOperations,
    disabled,
    isArchived,
    isSubmitting,
    setIsSubmitting,
    isEditing,
    sessionKey,
    onTitleChange,
    onEdit,
  } = props;
  // store hooks
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  // 离开提醒由编辑会话统一负责，这里只负责 2s 后把「已保存」收起
  useEffect(() => {
    if (isSubmitting === "submitted") {
      setTimeout(async () => {
        setIsSubmitting("saved");
      }, 2000);
    }
  }, [isSubmitting, setIsSubmitting]);

  // derived values
  const issue = issueId ? getIssueById(issueId) : undefined;
  const canEdit = !disabled && !isArchived;
  const fieldsDisabled = !canEdit || !isEditing;

  if (!issue || !issue.project_id) return <></>;

  return (
    <div className="min-w-0 space-y-6">
      <IssueParentDetail
        workspaceSlug={workspaceSlug}
        projectId={issue.project_id}
        issueId={issueId}
        issue={issue}
        issueOperations={issueOperations}
        disabled={fieldsDisabled}
      />
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
        isEditable={!disabled}
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
  );
});
