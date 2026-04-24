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
import useReloadConfirmations from "@/hooks/use-reload-confirmation";
// services
import { WorkItemVersionService } from "@/services/issue";
// local components
import type { TIssueOperations } from "../issue-detail";
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
  } = props;
  // store hooks
  const { data: currentUser } = useUser();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getUserDetails } = useMember();
  // reload confirmation
  const { setShowAlert } = useReloadConfirmations(isSubmitting === "submitting");

  useEffect(() => {
    if (isSubmitting === "submitted") {
      setShowAlert(false);
      setTimeout(async () => {
        setIsSubmitting("saved");
      }, 2000);
    } else if (isSubmitting === "submitting") {
      setShowAlert(true);
    }
  }, [isSubmitting, setShowAlert, setIsSubmitting]);

  // derived values
  const issue = issueId ? getIssueById(issueId) : undefined;

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
        disabled={disabled || isArchived}
      />
      <IssueTitleInput
        workspaceSlug={workspaceSlug}
        projectId={issue.project_id}
        issueId={issue.id}
        isSubmitting={isSubmitting}
        setIsSubmitting={(value) => setIsSubmitting(value)}
        issueOperations={issueOperations}
        disabled={disabled || isArchived}
        value={issue.name}
        containerClassName="-ml-3"
      />

      <div className="-ml-3">
        <PeekOverviewCorePropertyBar
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          issueOperations={issueOperations}
          disabled={disabled || isArchived}
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
            disabled={disabled || isArchived}
            editorRef={editorRef}
            entityId={issue.id}
            fileAssetType={EFileAssetType.ISSUE_DESCRIPTION}
            initialValue={issueDescription}
            key={issue.id}
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
              isRestoreDisabled: disabled || isArchived,
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
    </div>
  );
});
