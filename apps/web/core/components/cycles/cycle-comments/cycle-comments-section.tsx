/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Loader } from "@plane/ui";
import { useCycleComment } from "@/hooks/store/use-cycle-comment";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { CycleCommentCard } from "./cycle-comment-card";
import { CycleCommentCreate } from "./cycle-comment-create";
import { buildCommentTree } from "./cycle-comment-utils";

type Props = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
  disabled?: boolean;
  canCreateComment?: boolean;
  emptyHint?: string;
};

type CycleCommentComposerProps = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
};

export const CycleCommentComposer = observer(function CycleCommentComposer(props: CycleCommentComposerProps) {
  const { workspaceSlug, projectId, cycleId, disabled = false, placeholder = "发表评论...", autoFocus = false } = props;
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const { createComment } = useCycleComment();

  const handleCreate = async (data: { comment_html: string; comment_json?: unknown; parent?: string | null }) => {
    if (disabled) return undefined;
    return createComment(workspaceSlug, projectId, cycleId, {
      comment_html: data.comment_html,
      comment_json: (data.comment_json ?? undefined) as Record<string, unknown> | undefined,
      parent: data.parent ?? null,
    });
  };

  return (
    <CycleCommentCreate
      workspaceSlug={workspaceSlug}
      workspaceId={workspaceId}
      projectId={projectId}
      cycleId={cycleId}
      placeholder={disabled ? "你没有发表评论的权限" : placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      onSubmit={handleCreate}
    />
  );
});

export const CycleCommentsSection = observer(function CycleCommentsSection(props: Props) {
  const {
    workspaceSlug,
    projectId,
    cycleId,
    disabled = false,
    canCreateComment = true,
    emptyHint = "暂无评论，留下第一条想法吧",
  } = props;
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const { getCommentsByCycleId, fetchComments, createComment, removeComment } = useCycleComment();
  const comments = getCommentsByCycleId(cycleId);

  const { isLoading } = useSWR(
    workspaceSlug && projectId && cycleId ? ["cycle-comments", workspaceSlug, projectId, cycleId] : null,
    () => fetchComments(workspaceSlug, projectId, cycleId)
  );

  useEffect(() => {
    if (workspaceSlug && projectId && cycleId) {
      void fetchComments(workspaceSlug, projectId, cycleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId, cycleId]);

  const { roots, childrenByParent, commentsById } = useMemo(() => buildCommentTree(comments), [comments]);

  const canAddComment = !disabled && canCreateComment;

  const handleCreate = async (data: { comment_html: string; comment_json?: unknown; parent?: string | null }) => {
    if (!canAddComment) return undefined;
    return createComment(workspaceSlug, projectId, cycleId, {
      comment_html: data.comment_html,
      comment_json: (data.comment_json ?? undefined) as Record<string, unknown> | undefined,
      parent: data.parent ?? null,
    });
  };

  const handleRemove = async (commentId: string) => {
    await removeComment(workspaceSlug, projectId, cycleId, commentId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {isLoading && comments.length === 0 ? (
          <Loader className="space-y-3">
            <Loader.Item height="60px" />
            <Loader.Item height="60px" />
            <Loader.Item height="60px" />
          </Loader>
        ) : roots.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-placeholder">{emptyHint}</div>
        ) : (
          <div className="flex flex-col gap-4">
            {roots.map((comment) => (
              <CycleCommentCard
                key={comment.id}
                comment={comment}
                childrenByParent={childrenByParent}
                commentsById={commentsById}
                depth={0}
                workspaceSlug={workspaceSlug}
                workspaceId={workspaceId}
                projectId={projectId}
                cycleId={cycleId}
                disabled={!canAddComment}
                onRemove={handleRemove}
                onReply={handleCreate}
              />
            ))}
          </div>
        )}
      </div>

      <div className="relative z-[2] shrink-0 border-t border-subtle bg-surface-1 px-6 py-3">
        <CycleCommentComposer
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
          placeholder={canAddComment ? "发表评论..." : "你没有发表评论的权限"}
          autoFocus
          disabled={!canAddComment}
        />
      </div>
    </div>
  );
});
