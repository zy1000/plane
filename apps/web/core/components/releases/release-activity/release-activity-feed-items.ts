/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TReleaseActivity, TReleaseComment } from "@plane/types";

const toTimestamp = (value: string): number => new Date(value).getTime();

export const buildReleaseActivityFeedItems = (
  activities: TReleaseActivity[],
  comments: TReleaseComment[]
): TReleaseActivity[] => {
  const nonCommentActivities = activities.filter((activity) => activity.field !== "comment");
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));
  const commentActivities: TReleaseActivity[] = comments.map((comment) => {
    const parentComment = comment.parent ? commentsById.get(comment.parent) : undefined;
    return {
      id: `comment-${comment.id}`,
      workspace: comment.workspace,
      project: comment.project,
      release: comment.release,
      actor: comment.actor ?? null,
      actor_detail: comment.actor_detail,
      verb: "created",
      field: "comment",
      old_value: null,
      new_value: comment.comment_stripped || null,
      old_identifier: null,
      new_identifier: comment.id,
      comment: comment.comment_stripped ? `评论：${comment.comment_stripped}` : "新增了评论",
      release_comment: comment.id,
      epoch: null,
      extra: {
        comment_html: comment.comment_html ?? "",
        reply_to_actor: parentComment?.actor ?? null,
        reply_to_name: parentComment?.actor_detail?.display_name ?? null,
      },
      created_at: comment.created_at,
      updated_at: comment.updated_at,
    };
  });

  return [...nonCommentActivities, ...commentActivities].sort(
    (a, b) => toTimestamp(a.created_at) - toTimestamp(b.created_at)
  );
};
