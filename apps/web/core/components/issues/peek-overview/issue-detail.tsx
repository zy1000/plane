/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import { EFileAssetType } from "@plane/types";
import type { TNameDescriptionLoader } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { DescriptionVersionsRoot } from "@/components/core/description-versions";
import { DescriptionInput } from "@/components/editor/rich-text/description-input";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
// services
import { WorkItemVersionService } from "@/services/issue";
// local components
import type { TIssueOperations } from "../issue-detail";
import { IssueExtraFieldsSection } from "../issue-detail/extra-fields-section";
import { IssueParentDetail } from "../issue-detail/parent";
import { IssueReaction } from "../issue-detail/reactions";
import { IssueTitleInput } from "../title-input";
import { PeekOverviewCorePropertyBar } from "./core-property-bar";
// services init
const workItemVersionService = new WorkItemVersionService();

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
  /** 标题下属性条外层 class：两栏布局时属性挪到右栏「基本」组，由调用方传 hidden */
  propertyBarClassName?: string;
  /** 处于编辑会话中（点了「编辑」且不在保存中）：标题 / 描述 / 属性 / 自定义字段才可改 */
  isEditing: boolean;
  /** 取消编辑后变化，让标题 / 描述编辑器重挂回到保存前的值 */
  sessionKey: number;
  onTitleChange: (value: string) => void;
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
    propertyBarClassName,
    isEditing,
    sessionKey,
    onTitleChange,
  } = props;
  // store hooks
  const { data: currentUser } = useUser();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getUserDetails } = useMember();
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

  // 描述折叠态：限制最大高度并提供 “显示全部 / 显示更少” 按钮
  const DESCRIPTION_COLLAPSED_MAX_HEIGHT = 320;
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isDescriptionOverflowing, setIsDescriptionOverflowing] = useState(false);
  const descriptionWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsDescriptionExpanded(false);
  }, [issueId]);

  useLayoutEffect(() => {
    const el = descriptionWrapperRef.current;
    if (!el) return;

    const measure = () => {
      // 折叠时 wrapper 自身高度被 max-height 限制，scrollHeight 反映内容真实高度，可据此判断是否溢出
      const overflow = el.scrollHeight - DESCRIPTION_COLLAPSED_MAX_HEIGHT > 1;
      setIsDescriptionOverflowing(overflow);
    };

    measure();

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      // 观察内部内容节点：折叠时 wrapper 尺寸被钳制，内容节点尺寸变化才是触发源
      const target = el.firstElementChild ?? el;
      observer.observe(target);
    }

    return () => {
      observer?.disconnect();
    };
  }, [issueId, issue?.description_html, isDescriptionExpanded]);

  if (!issue || !issue.project_id) return <></>;

  const issueDescription =
    issue.description_html !== undefined || issue.description_html !== null
      ? issue.description_html != ""
        ? issue.description_html
        : "<p></p>"
      : undefined;
  return (
    <div className="space-y-2">
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
        containerClassName="-ml-3"
      />

      <div className={cn("-ml-3", propertyBarClassName)}>
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
            !isDescriptionExpanded && isDescriptionOverflowing && "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-12 after:bg-gradient-to-t after:from-surface-1 after:to-transparent"
          )}
          style={{
            maxHeight:
              isDescriptionExpanded || !isDescriptionOverflowing ? "none" : `${DESCRIPTION_COLLAPSED_MAX_HEIGHT}px`,
          }}
        >
          <DescriptionInput
            issueSequenceId={issue.sequence_id}
            containerClassName="-ml-3 border-none"
            disabled={fieldsDisabled}
            editorRef={editorRef}
            entityId={issue.id}
            fileAssetType={EFileAssetType.ISSUE_DESCRIPTION}
            initialValue={issueDescription}
            key={`${issue.id}-${sessionKey}`}
            onSubmit={async (value, isMigrationUpdate) => {
              if (!issue.id || !issue.project_id) return;

              if (issue.description_html === value) return;
              if (
                (!issue.description_html || issue.description_html === "" || issue.description_html === "<p></p>") &&
                (value === "" || value === "<p></p>")
              )
                return;

              await issueOperations.update(workspaceSlug, issue.project_id, issue.id, {
                description_html: value.description_html,
                ...(isMigrationUpdate ? { skip_activity: "true" } : {}),
              });
            }}
            setIsSubmitting={(value) => setIsSubmitting(value)}
            projectId={issue.project_id}
            workspaceSlug={workspaceSlug}
          />
        </div>
        {isDescriptionOverflowing && (
          <button
            type="button"
            onClick={() => setIsDescriptionExpanded((prev) => !prev)}
            className="text-body-sm-medium text-accent-primary hover:underline"
          >
            {isDescriptionExpanded ? "显示更少" : "显示全部"}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {currentUser && (
          <IssueReaction
            workspaceSlug={workspaceSlug}
            projectId={issue.project_id}
            issueId={issueId}
            currentUser={currentUser}
            disabled={isArchived}
          />
        )}
        {!disabled && (
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
                workItemVersionService.listDescriptionVersions(
                  workspaceSlug,
                  issue.project_id?.toString() ?? "",
                  issueId
                ),
              retrieveDescriptionVersion: (issueId, versionId) =>
                workItemVersionService.retrieveDescriptionVersion(
                  workspaceSlug,
                  issue.project_id?.toString() ?? "",
                  issueId,
                  versionId
                ),
            }}
            handleRestore={(descriptionHTML) => editorRef.current?.setEditorValue(descriptionHTML, true)}
            projectId={issue.project_id}
            workspaceSlug={workspaceSlug}
          />
        )}
      </div>

      <div className="pt-2">
        <IssueExtraFieldsSection
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          issueOperations={issueOperations}
          disabled={fieldsDisabled}
          dimmed={!canEdit}
        />
      </div>
    </div>
  );
});
