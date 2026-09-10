import { useCallback, useEffect, useState } from "react";
import type { TReviewTailoringActivity, TReviewTailoringComment } from "@plane/types";
import { ReviewTailoringService } from "@/services/review-tailoring.service";

const service = new ReviewTailoringService();

/**
 * 变更历史 + 评论。
 *
 * 两者一起拉：详情页把它们并排放在同一组 Tab 里，分开管会让两次 loading 各闪一次。
 * 评论发布后不可编辑，只允许作者本人删 —— 与后端一致。
 */
export const useReviewTailoringFeed = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  tailoringId: string | undefined
) => {
  const [activities, setActivities] = useState<TReviewTailoringActivity[]>([]);
  const [comments, setComments] = useState<TReviewTailoringComment[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && projectId && tailoringId));
  const [isMutating, setIsMutating] = useState(false);

  const fetchFeed = useCallback(async () => {
    if (!workspaceSlug || !projectId || !tailoringId) return;
    setIsLoading(true);
    try {
      const [nextActivities, nextComments] = await Promise.all([
        service.listActivities(workspaceSlug, projectId, tailoringId),
        service.listComments(workspaceSlug, projectId, tailoringId),
      ]);
      setActivities(nextActivities);
      setComments(nextComments);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId, tailoringId]);

  useEffect(() => {
    void fetchFeed().catch(() => undefined);
  }, [fetchFeed]);

  const createComment = useCallback(
    async (commentHtml: string) => {
      if (!workspaceSlug || !projectId || !tailoringId) return undefined;
      setIsMutating(true);
      try {
        const created = await service.createComment(workspaceSlug, projectId, tailoringId, {
          comment_html: commentHtml,
        });
        setComments((current) => [...current, created]);
        // 评论也会写一条活动，历史那一栏要跟着更新
        void service.listActivities(workspaceSlug, projectId, tailoringId).then(setActivities).catch(() => undefined);
        return created;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, projectId, tailoringId]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!workspaceSlug || !projectId || !tailoringId) return;
      setIsMutating(true);
      try {
        await service.deleteComment(workspaceSlug, projectId, tailoringId, commentId);
        setComments((current) => current.filter((item) => item.id !== commentId));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, projectId, tailoringId]
  );

  return { activities, comments, isLoading, isMutating, fetchFeed, createComment, deleteComment };
};
