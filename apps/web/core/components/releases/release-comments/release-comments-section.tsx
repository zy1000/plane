/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Loader } from "@plane/ui";
import { useReleaseComment } from "@/hooks/store/use-release-comment";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { ReleaseCommentCard } from "./release-comment-card";
import { ReleaseCommentCreate } from "./release-comment-create";
import { buildCommentTree } from "./release-comment-utils";

type Props = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
  disabled?: boolean;
  canCreateComment?: boolean;
  emptyHint?: string;
};

type ReleaseCommentComposerProps = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
};

export const ReleaseCommentComposer = observer(function ReleaseCommentComposer(props: ReleaseCommentComposerProps) {
  const {
    workspaceSlug,
    projectId,
    releaseId,
    disabled = false,
    placeholder = "发表评论...",
    autoFocus = false,
  } = props;
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const { createComment } = useReleaseComment();

  const handleCreate = async (data: { comment_html: string; comment_json?: unknown; parent?: string | null }) => {
    if (disabled) return undefined;
    return createComment(workspaceSlug, projectId, releaseId, {
      comment_html: data.comment_html,
      comment_json: (data.comment_json ?? undefined) as Record<string, unknown> | undefined,
      parent: data.parent ?? null,
    });
  };

  return (
    <ReleaseCommentCreate
      workspaceSlug={workspaceSlug}
      workspaceId={workspaceId}
      projectId={projectId}
      releaseId={releaseId}
      placeholder={disabled ? "你没有发表评论的权限" : placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      onSubmit={handleCreate}
    />
  );
});

export const ReleaseCommentsSection = observer(function ReleaseCommentsSection(props: Props) {
  const {
    workspaceSlug,
    projectId,
    releaseId,
    disabled = false,
    canCreateComment = true,
    emptyHint = "暂无评论，留下第一条想法吧",
  } = props;
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const { getCommentsByReleaseId, fetchComments, createComment, removeComment } = useReleaseComment();
  const comments = getCommentsByReleaseId(releaseId);

  const { isLoading } = useSWR(
    workspaceSlug && projectId && releaseId ? ["release-comments", workspaceSlug, projectId, releaseId] : null,
    () => fetchComments(workspaceSlug, projectId, releaseId)
  );

  useEffect(() => {
    if (workspaceSlug && projectId && releaseId) {
      void fetchComments(workspaceSlug, projectId, releaseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId, releaseId]);

  const { roots, childrenByParent, commentsById } = useMemo(() => buildCommentTree(comments), [comments]);
  const canAddComment = !disabled && canCreateComment;

  const handleCreate = async (data: { comment_html: string; comment_json?: unknown; parent?: string | null }) => {
    if (!canAddComment) return undefined;
    return createComment(workspaceSlug, projectId, releaseId, {
      comment_html: data.comment_html,
      comment_json: (data.comment_json ?? undefined) as Record<string, unknown> | undefined,
      parent: data.parent ?? null,
    });
  };

  const handleRemove = async (commentId: string) => {
    await removeComment(workspaceSlug, projectId, releaseId, commentId);
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
              <ReleaseCommentCard
                key={comment.id}
                comment={comment}
                childrenByParent={childrenByParent}
                commentsById={commentsById}
                depth={0}
                workspaceSlug={workspaceSlug}
                workspaceId={workspaceId}
                projectId={projectId}
                releaseId={releaseId}
                disabled={disabled}
                canCreateComment={canCreateComment}
                onRemove={handleRemove}
                onReply={handleCreate}
              />
            ))}
          </div>
        )}
      </div>

      <div className="relative z-[2] shrink-0 border-t border-subtle bg-surface-1 px-6 py-3">
        <ReleaseCommentComposer
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          releaseId={releaseId}
          placeholder={canAddComment ? "发表评论..." : "你没有发表评论的权限"}
          autoFocus
          disabled={!canAddComment}
        />
      </div>
    </div>
  );
});
