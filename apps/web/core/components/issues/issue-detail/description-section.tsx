/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { ChevronDown, Pencil, Plus } from "lucide-react";
import type { EditorRefApi } from "@plane/editor";
import { EFileAssetType } from "@plane/types";
import type { TNameDescriptionLoader } from "@plane/types";
import { cn, isEmptyHtmlString } from "@plane/utils";
import { DescriptionVersionsRoot } from "@/components/core/description-versions";
import { DescriptionInput } from "@/components/editor/rich-text/description-input";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { WorkItemVersionService } from "@/services/issue";
import { IssueReaction } from "./reactions";
import type { TIssueOperations } from "./root";

const workItemVersionService = new WorkItemVersionService();
const COLLAPSED_HEIGHT = 144;
const DESCRIPTION_CONTENT_TAGS = [
  "img",
  "image-component",
  "mention-component",
  "embed-component",
  "issue-embed-component",
  "video",
  "audio",
  "iframe",
  "table",
  "hr",
];

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  editorRef: React.RefObject<EditorRefApi>;
  isEditable: boolean;
  isArchived: boolean;
  isEditing: boolean;
  sessionKey: number;
  setIsSubmitting: (value: TNameDescriptionLoader) => void;
  onEdit?: () => void;
};

/** Shared description stays mounted outside business tabs, including when the saved description is empty. */
export const IssueDescriptionSection = observer(function IssueDescriptionSection({
  workspaceSlug,
  projectId,
  issueId,
  issueOperations,
  editorRef,
  isEditable,
  isArchived,
  isEditing,
  sessionKey,
  setIsSubmitting,
  onEdit,
}: Props) {
  const id = useId();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { data: currentUser } = useUser();
  const { getUserDetails } = useMember();
  const issue = getIssueById(issueId);
  const disabled = !isEditable || isArchived || !isEditing;
  const isEmpty = isEmptyHtmlString(issue?.description_html ?? "", DESCRIPTION_CONTENT_TAGS);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const focusRequested = useRef(false);

  useEffect(() => {
    setExpanded(false);
    focusRequested.current = false;
  }, [issueId]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !disabled || isEmpty) return;
    const measure = () => setOverflowing(content.scrollHeight > COLLAPSED_HEIGHT + 1);
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(content);
    return () => resizeObserver.disconnect();
  }, [disabled, isEmpty, issueId, issue?.description_html, sessionKey]);

  useEffect(() => {
    if (disabled || !focusRequested.current) return;
    const frame = requestAnimationFrame(() => {
      editorRef.current?.focus("start");
      focusRequested.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [disabled, editorRef]);

  if (!issue) return null;
  const collapsed = disabled && overflowing && !expanded;
  const editDescription = () => {
    focusRequested.current = true;
    onEdit?.();
  };

  return (
    <section aria-labelledby={`${id}-label`} className="min-w-0 space-y-3 py-1">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h2 id={`${id}-label`} className="text-13 font-semibold text-primary">
          描述
        </h2>
        {disabled && !isEmpty && onEdit && (
          <button
            type="button"
            onClick={editDescription}
            className="flex items-center gap-1.5 rounded text-12 text-secondary hover:text-accent-primary"
          >
            <Pencil className="size-3.5" />
            编辑描述
          </button>
        )}
      </div>
      {disabled &&
        isEmpty &&
        (onEdit ? (
          <button
            type="button"
            onClick={editDescription}
            className="hover:border-accent-primary flex w-full items-center gap-2 rounded-md border border-dashed border-strong bg-layer-1/30 px-3 py-4 text-left text-13 text-secondary hover:text-accent-primary"
          >
            <Plus className="size-4 shrink-0" />
            添加描述，补充工作项的背景和目标
          </button>
        ) : (
          <p className="py-2 text-13 text-tertiary">暂无描述</p>
        ))}
      <div hidden={disabled && isEmpty}>
        <div
          id={`${id}-content`}
          className={cn(
            "relative min-w-0",
            collapsed &&
              "overflow-hidden after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-8 after:bg-gradient-to-t after:from-surface-1 after:to-transparent"
          )}
          style={collapsed ? { maxHeight: COLLAPSED_HEIGHT } : undefined}
        >
          <div ref={contentRef}>
            <DescriptionInput
              key={`${issue.id}-${sessionKey}`}
              issueSequenceId={issue.sequence_id}
              containerClassName={cn(
                "text-14 [&_.ProseMirror]:min-h-0 [&_.ProseMirror]:break-words [&_.ProseMirror]:[--font-size-regular:14px] [&_.ProseMirror]:[--line-height-regular:1.9]",
                disabled
                  ? "rounded-none border-none p-0 [&_.ProseMirror]:p-0"
                  : "focus-within:border-accent-primary rounded-md border border-strong px-3 py-2 [&_.ProseMirror]:min-h-36"
              )}
              disabled={disabled}
              editorRef={editorRef}
              entityId={issue.id}
              fileAssetType={EFileAssetType.ISSUE_DESCRIPTION}
              initialValue={issue.description_html || "<p></p>"}
              onSubmit={async (value, isMigrationUpdate) => {
                await issueOperations.update(workspaceSlug, projectId, issue.id, {
                  description_html: value.description_html,
                  ...(isMigrationUpdate ? { skip_activity: "true" } : {}),
                });
              }}
              projectId={projectId}
              setIsSubmitting={setIsSubmitting}
              workspaceSlug={workspaceSlug}
            />
          </div>
        </div>
        {disabled && overflowing && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`${id}-content`}
            onClick={() => setExpanded((value) => !value)}
            className="mt-2 flex items-center gap-1 rounded text-12 text-accent-primary hover:underline"
          >
            {expanded ? "收起描述" : "展开完整描述"}
            <ChevronDown className={cn("size-3.5", expanded && "rotate-180")} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {currentUser && (
          <IssueReaction
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            currentUser={currentUser}
            disabled={isArchived}
          />
        )}
        {isEditable && (
          <DescriptionVersionsRoot
            className="ml-auto shrink-0"
            entityInformation={{
              createdAt: issue.created_at ? new Date(issue.created_at) : new Date(),
              createdByDisplayName: getUserDetails(issue.created_by ?? "")?.display_name ?? "",
              id: issueId,
              isRestoreDisabled: disabled,
            }}
            fetchHandlers={{
              listDescriptionVersions: (entityId) =>
                workItemVersionService.listDescriptionVersions(workspaceSlug, projectId, entityId),
              retrieveDescriptionVersion: (entityId, versionId) =>
                workItemVersionService.retrieveDescriptionVersion(workspaceSlug, projectId, entityId, versionId),
            }}
            handleRestore={(html) => editorRef.current?.setEditorValue(html, true)}
            projectId={projectId}
            workspaceSlug={workspaceSlug}
          />
        )}
      </div>
    </section>
  );
});
