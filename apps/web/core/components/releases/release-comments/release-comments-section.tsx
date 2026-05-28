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
  emptyHint?: string;
};

export const ReleaseCommentsSection = observer(function ReleaseCommentsSection(props: Props) {
  const { workspaceSlug, projectId, releaseId, disabled = false, emptyHint = "暂无评论，留下第一条想法吧" } = props;
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const { getCommentsByReleaseId, fetchComments, createComment, removeComment } = useReleaseComment();
  const comments = getCommentsByReleaseId(releaseId);

  const { isLoading } = useSWR(
    workspaceSlug && projectId && releaseId
      ? ["release-comments", workspaceSlug, projectId, releaseId]
      : null,
    () => fetchComments(workspaceSlug, projectId, releaseId)
  );

  useEffect(() => {
    if (workspaceSlug && projectId && releaseId) {
      void fetchComments(workspaceSlug, projectId, releaseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId, releaseId]);

  const { roots, childrenByParent, commentsById } = useMemo(() => buildCommentTree(comments), [comments]);

  const handleCreate = async (data: { comment_html: string; comment_json?: unknown; parent?: string | null }) =>
    createComment(workspaceSlug, projectId, releaseId, {
      comment_html: data.comment_html,
      comment_json: (data.comment_json ?? undefined) as Record<string, unknown> | undefined,
      parent: data.parent ?? null,
    });

  const handleRemove = async (commentId: string) => {
    await removeComment(workspaceSlug, projectId, releaseId, commentId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {!disabled && (
        <div className="shrink-0">
          <ReleaseCommentCreate
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            projectId={projectId}
            releaseId={releaseId}
            placeholder="发表评论..."
            onSubmit={handleCreate}
          />
        </div>
      )}

      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto pr-1">
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
                onRemove={handleRemove}
                onReply={handleCreate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
