/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import type { TNameDescriptionLoader } from "@plane/types";
import { EFileAssetType, EIssueServiceType } from "@plane/types";
import { cn, getTextContent } from "@plane/utils";
// components
import { DescriptionVersionsRoot } from "@/components/core/description-versions";
import { DescriptionInput } from "@/components/editor/rich-text/description-input";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
import useSize from "@/hooks/use-window-size";
// plane web components
import { DeDupeIssuePopoverRoot } from "@/plane-web/components/de-dupe/duplicate-popover";
import { useDebouncedDuplicateIssues } from "@/plane-web/hooks/use-debounced-duplicate-issues";
// services
import { WorkItemVersionService } from "@/services/issue";
// local imports
import { IssueDetailWidgets } from "../issue-detail-widgets";
import { PeekOverviewCorePropertyBar } from "../peek-overview/core-property-bar";
import { PeekOverviewProperties } from "../peek-overview/properties";
import { IssueTitleInput } from "../title-input";
import { IssueExtraFieldsSection } from "./extra-fields-section";
import { IssueActivity } from "./issue-activity";
import { IssueParentDetail } from "./parent";
import { IssueReaction } from "./reactions";
import type { TIssueOperations } from "./root";
// services init
const workItemVersionService = new WorkItemVersionService();

/** 与 PeekOverviewIssueDetails 一致：折叠态最大高度 */
const DESCRIPTION_COLLAPSED_MAX_HEIGHT_PX = 320;

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
  } = props;
  // hooks
  const windowSize = useSize();
  const { data: currentUser } = useUser();
  const { getUserDetails } = useMember();
  // 右栏开着时状态/负责人等在右栏「基本」组，标题下属性条隐藏
  const { issueDetailSidebarCollapsed } = useAppTheme();
  const {
    issue: { getIssueById },
    peekIssue,
  } = useIssueDetail();
  const { getProjectById } = useProject();
  const { t } = useTranslation();
  // derived values
  const projectDetails = getProjectById(projectId);
  const issue = issueId ? getIssueById(issueId) : undefined;
  const canEdit = isEditable && !isArchived;
  // 非编辑态一律只读；离开提醒由编辑会话统一负责
  const fieldsDisabled = !canEdit || !isEditing;
  // 描述折叠态：限制最大高度并提供「显示全部 / 显示更少」（对齐 peek 侧栏详情）
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isDescriptionOverflowing, setIsDescriptionOverflowing] = useState(false);
  const descriptionWrapperRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    setIsDescriptionExpanded(false);
  }, [issueId]);

  useLayoutEffect(() => {
    const el = descriptionWrapperRef.current;
    if (!el) return;

    const measure = () => {
      const overflow = el.scrollHeight - DESCRIPTION_COLLAPSED_MAX_HEIGHT_PX > 1;
      setIsDescriptionOverflowing(overflow);
    };

    measure();

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      const target = el.firstElementChild ?? el;
      observer.observe(target);
    }

    return () => {
      observer?.disconnect();
    };
  }, [issueId, issue?.description_html, isDescriptionExpanded]);

  if (!issue || !issue.project_id) return <></>;

  const isPeekModeActive = Boolean(peekIssue);

  return (
    <>
      <div className="space-y-4 rounded-lg">
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
          containerClassName="-ml-3"
        />

        <div className={cn("-ml-3", !issueDetailSidebarCollapsed && "hidden")}>
          <PeekOverviewCorePropertyBar
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            issueOperations={issueOperations}
            disabled={fieldsDisabled}
            dimmed={!canEdit}
          />
        </div>

        <div className="space-y-1">
          <div
            ref={descriptionWrapperRef}
            className={cn(
              "relative overflow-hidden transition-[max-height] duration-200 ease-in-out",
              !isDescriptionExpanded &&
                isDescriptionOverflowing &&
                "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-12 after:bg-gradient-to-t after:from-surface-1 after:to-transparent"
            )}
            style={{
              maxHeight:
                isDescriptionExpanded || !isDescriptionOverflowing
                  ? "none"
                  : `${DESCRIPTION_COLLAPSED_MAX_HEIGHT_PX}px`,
            }}
          >
            <DescriptionInput
              issueSequenceId={issue.sequence_id}
              containerClassName="-ml-3 border-none"
              disabled={fieldsDisabled}
              editorRef={editorRef}
              entityId={issue.id}
              fileAssetType={EFileAssetType.ISSUE_DESCRIPTION}
              initialValue={
                issue.description_html !== undefined && issue.description_html !== null
                  ? issue.description_html !== ""
                    ? issue.description_html
                    : "<p></p>"
                  : "<p></p>"
              }
              key={`${issue.id}-${sessionKey}`}
              onSubmit={async (value, isMigrationUpdate) => {
                if (!issue.id || !issue.project_id) return;
                await issueOperations.update(workspaceSlug, issue.project_id, issue.id, {
                  description_html: value.description_html,
                  ...(isMigrationUpdate ? { skip_activity: "true" } : {}),
                });
              }}
              projectId={issue.project_id}
              setIsSubmitting={(value) => setIsSubmitting(value)}
              workspaceSlug={workspaceSlug}
            />
          </div>
          {isDescriptionOverflowing && (
            <button
              type="button"
              onClick={() => setIsDescriptionExpanded((prev) => !prev)}
              className="text-body-sm-medium text-accent-primary hover:underline"
            >
              {isDescriptionExpanded ? t("show_less") : t("show_all")}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {currentUser && (
            <IssueReaction
              className="flex-shrink-0"
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              currentUser={currentUser}
              disabled={isArchived}
            />
          )}
          {isEditable && (
            <DescriptionVersionsRoot
              className="flex-shrink-0"
              entityInformation={{
                createdAt: issue.created_at ? new Date(issue.created_at) : new Date(),
                createdByDisplayName: getUserDetails(issue.created_by ?? "")?.display_name ?? "",
                id: issueId,
                // 恢复历史版本等于改描述，只在编辑态开放，随保存一起提交
                isRestoreDisabled: fieldsDisabled,
              }}
              fetchHandlers={{
                listDescriptionVersions: (issueId) =>
                  workItemVersionService.listDescriptionVersions(workspaceSlug, projectId, issueId),
                retrieveDescriptionVersion: (issueId, versionId) =>
                  workItemVersionService.retrieveDescriptionVersion(workspaceSlug, projectId, issueId, versionId),
              }}
              handleRestore={(descriptionHTML) => editorRef.current?.setEditorValue(descriptionHTML, true)}
              projectId={projectId}
              workspaceSlug={workspaceSlug}
            />
          )}
        </div>

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
