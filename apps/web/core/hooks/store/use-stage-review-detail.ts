import { useCallback, useEffect, useState } from "react";
import type {
  TStageReviewActivity,
  TStageReviewAttachment,
  TStageReviewComment,
  TStageReviewDetail,
  TSubmitStageReviewPayload,
  TUpdateStageReviewPayload,
} from "@plane/types";
import { StageReviewService } from "@/services/stage-review.service";
import { getStageReviewError } from "./use-stage-reviews";

const service = new StageReviewService();

/**
 * 抽屉里的一条评审：详情 + 附件 + 评论 + 轨迹。
 *
 * 详情、附件、评论、轨迹一起拉 —— 抽屉是一屏铺开的，分开管会让四个 loading 各闪一次。
 * 所有写动作的响应都是完整详情，直接整块替换，不再补一次拉取。
 *
 * `reviewId` 为空表示抽屉关着：这时不发任何请求，也把上一条的数据清掉，避免下次打开
 * 时先闪一帧旧评审。
 */
export const useStageReviewDetail = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  reviewId: string | null
) => {
  const [detail, setDetail] = useState<TStageReviewDetail | null>(null);
  const [attachments, setAttachments] = useState<TStageReviewAttachment[]>([]);
  const [comments, setComments] = useState<TStageReviewComment[]>([]);
  const [activities, setActivities] = useState<TStageReviewActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!workspaceSlug || !projectId || !reviewId) {
      setDetail(null);
      setAttachments([]);
      setComments([]);
      setActivities([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [nextDetail, nextAttachments, nextComments, nextActivities] = await Promise.all([
        service.retrieve(workspaceSlug, projectId, reviewId),
        service.listFiles(workspaceSlug, projectId, reviewId),
        service.listComments(workspaceSlug, projectId, reviewId),
        service.listActivities(workspaceSlug, projectId, reviewId),
      ]);
      setDetail(nextDetail);
      setAttachments(nextAttachments);
      setComments(nextComments);
      setActivities(nextActivities);
    } catch (requestError) {
      setError(getStageReviewError(requestError).message);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId, reviewId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  /** 状态一动就补一次轨迹：推进那条记录是同事务写进去的，不重拉就看不到 */
  const refreshActivities = useCallback(() => {
    if (!workspaceSlug || !projectId || !reviewId) return;
    void service.listActivities(workspaceSlug, projectId, reviewId).then(setActivities).catch(() => undefined);
  }, [workspaceSlug, projectId, reviewId]);

  const runMutation = useCallback(
    async (action: () => Promise<TStageReviewDetail>) => {
      setIsMutating(true);
      try {
        const next = await action();
        setDetail(next);
        refreshActivities();
        return next;
      } finally {
        setIsMutating(false);
      }
    },
    [refreshActivities]
  );

  const updateReview = useCallback(
    async (payload: TUpdateStageReviewPayload) => {
      if (!workspaceSlug || !projectId || !reviewId) return undefined;
      return runMutation(() => service.update(workspaceSlug, projectId, reviewId, payload));
    },
    [workspaceSlug, projectId, reviewId, runMutation]
  );

  /** 推进一步。评审中 → 审核中 这一跳要带结论，其余两跳 payload 留空 */
  const advance = useCallback(
    async (payload?: TSubmitStageReviewPayload) => {
      if (!workspaceSlug || !projectId || !reviewId) return undefined;
      return runMutation(() => service.advance(workspaceSlug, projectId, reviewId, payload));
    },
    [workspaceSlug, projectId, reviewId, runMutation]
  );

  const rollback = useCallback(async () => {
    if (!workspaceSlug || !projectId || !reviewId) return undefined;
    return runMutation(() => service.rollback(workspaceSlug, projectId, reviewId));
  }, [workspaceSlug, projectId, reviewId, runMutation]);

  const uploadAttachment = useCallback(
    async (file: File) => {
      if (!workspaceSlug || !projectId || !reviewId) return undefined;
      setIsMutating(true);
      try {
        const created = await service.uploadFile(workspaceSlug, projectId, reviewId, file);
        setAttachments((current) => [...current, created]);
        refreshActivities();
        return created;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, projectId, reviewId, refreshActivities]
  );

  const deleteAttachment = useCallback(
    async (assetId: string) => {
      if (!workspaceSlug || !projectId || !reviewId) return;
      setIsMutating(true);
      try {
        await service.deleteFile(workspaceSlug, projectId, reviewId, assetId);
        setAttachments((current) => current.filter((item) => item.id !== assetId));
        refreshActivities();
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, projectId, reviewId, refreshActivities]
  );

  /** 下载走后端换预签名地址，再让浏览器自己取对象（口径同发布单附件） */
  const downloadAttachment = useCallback(
    async (assetId: string) => {
      if (!workspaceSlug || !projectId || !reviewId) return;
      const url = await service.getFileDownloadUrl(workspaceSlug, projectId, reviewId, assetId);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
    [workspaceSlug, projectId, reviewId]
  );

  const createComment = useCallback(
    async (commentHtml: string) => {
      if (!workspaceSlug || !projectId || !reviewId) return undefined;
      setIsMutating(true);
      try {
        const created = await service.createComment(workspaceSlug, projectId, reviewId, {
          comment_html: commentHtml,
        });
        setComments((current) => [...current, created]);
        refreshActivities();
        return created;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, projectId, reviewId, refreshActivities]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!workspaceSlug || !projectId || !reviewId) return;
      setIsMutating(true);
      try {
        await service.deleteComment(workspaceSlug, projectId, reviewId, commentId);
        setComments((current) => current.filter((item) => item.id !== commentId));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, projectId, reviewId]
  );

  return {
    detail,
    attachments,
    comments,
    activities,
    isLoading,
    isMutating,
    error,
    updateReview,
    advance,
    rollback,
    uploadAttachment,
    deleteAttachment,
    downloadAttachment,
    createComment,
    deleteComment,
  };
};
