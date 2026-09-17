import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TApproveStageReviewPayload,
  TRollbackStageReviewPayload,
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

/** 「已保存」停留多久再收起 */
const SAVED_VISIBLE_MS = 2000;

/**
 * 抽屉顶栏的保存状态。字段、附件、评论这类「随手改」的写入走它，不弹成功 toast；
 * 开始 / 提交 / 审核 / 退回这四个动作不走它 —— 动作要有明确的 toast 回执。
 */
export type TStageReviewSaveState = "idle" | "saving" | "saved" | "error";

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
  const [saveState, setSaveState] = useState<TStageReviewSaveState>("idle");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSavesRef = useRef(0);
  /** 最近一次失败的保存，原样重放用；成功重试或换评审时清掉 */
  const lastFailedSaveRef = useRef<(() => Promise<unknown>) | null>(null);

  const resetSaveState = useCallback(() => {
    clearTimeout(savedTimerRef.current);
    pendingSavesRef.current = 0;
    lastFailedSaveRef.current = null;
    setSaveState("idle");
  }, []);

  const fetchAll = useCallback(async () => {
    resetSaveState();
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
  }, [workspaceSlug, projectId, reviewId, resetSaveState]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => () => clearTimeout(savedTimerRef.current), []);

  /** 状态一动就补一次轨迹：推进那条记录是同事务写进去的，不重拉就看不到 */
  const refreshActivities = useCallback(() => {
    if (!workspaceSlug || !projectId || !reviewId) return;
    void service.listActivities(workspaceSlug, projectId, reviewId).then(setActivities).catch(() => undefined);
  }, [workspaceSlug, projectId, reviewId]);

  /**
   * 回灌一份详情。字段保存与动作可能同时在飞（比如标题刚失焦就点了开始评审），
   * 晚到的旧响应不能把新状态盖回去，所以按 updated_at 只收不比手上旧的那份。
   */
  const applyDetail = useCallback((next: TStageReviewDetail) => {
    setDetail((current) =>
      !current || current.id !== next.id || next.updated_at >= current.updated_at ? next : current
    );
  }, []);

  /**
   * 「随手改」的写入：顶栏显示 保存中 → 已保存（2 秒后收起）/ 保存失败。
   * 几个保存并发时，全部落地才算「已保存」；有一个失败就停在「保存失败」，直到重试成功。
   * 不碰 isMutating —— 否则每改一个字段，标题行的动作按钮都要闪一下置灰。
   */
  const runSave = useCallback(async <T>(save: () => Promise<T>): Promise<T> => {
    clearTimeout(savedTimerRef.current);
    pendingSavesRef.current += 1;
    setSaveState("saving");
    try {
      const result = await save();
      pendingSavesRef.current -= 1;
      if (pendingSavesRef.current === 0) {
        if (lastFailedSaveRef.current) {
          setSaveState("error");
        } else {
          setSaveState("saved");
          savedTimerRef.current = setTimeout(() => setSaveState("idle"), SAVED_VISIBLE_MS);
        }
      }
      return result;
    } catch (saveError) {
      pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
      lastFailedSaveRef.current = save;
      setSaveState("error");
      throw saveError;
    }
  }, []);

  const retryLastSave = useCallback(async () => {
    const save = lastFailedSaveRef.current;
    if (!save) return undefined;
    lastFailedSaveRef.current = null;
    return runSave(save);
  }, [runSave]);

  /** 推进 / 退回：整块替换详情并补轨迹，期间锁住动作按钮 */
  const runAction = useCallback(
    async (action: () => Promise<TStageReviewDetail>) => {
      setIsMutating(true);
      try {
        const next = await action();
        applyDetail(next);
        refreshActivities();
        return next;
      } finally {
        setIsMutating(false);
      }
    },
    [applyDetail, refreshActivities]
  );

  const updateReview = useCallback(
    async (payload: TUpdateStageReviewPayload) => {
      if (!workspaceSlug || !projectId || !reviewId) return undefined;
      return runSave(async () => {
        const next = await service.update(workspaceSlug, projectId, reviewId, payload);
        applyDetail(next);
        refreshActivities();
        return next;
      });
    },
    [workspaceSlug, projectId, reviewId, runSave, applyDetail, refreshActivities]
  );

  /** 推进一步。评审中 → 审核中 这一跳要带结论，审核中 → 已评审 可带审核意见，开始 payload 留空 */
  const advance = useCallback(
    async (payload?: TSubmitStageReviewPayload | TApproveStageReviewPayload) => {
      if (!workspaceSlug || !projectId || !reviewId) return undefined;
      return runAction(() => service.advance(workspaceSlug, projectId, reviewId, payload));
    },
    [workspaceSlug, projectId, reviewId, runAction]
  );

  /** 退回一步。理由必填，只进轨迹 */
  const rollback = useCallback(
    async (payload: TRollbackStageReviewPayload) => {
      if (!workspaceSlug || !projectId || !reviewId) return undefined;
      return runAction(() => service.rollback(workspaceSlug, projectId, reviewId, payload));
    },
    [workspaceSlug, projectId, reviewId, runAction]
  );

  const uploadAttachment = useCallback(
    async (file: File, onProgress?: (percentage: number) => void) => {
      if (!workspaceSlug || !projectId || !reviewId) return undefined;
      return runSave(async () => {
        const created = await service.uploadFile(workspaceSlug, projectId, reviewId, file, onProgress);
        setAttachments((current) => [...current, created]);
        refreshActivities();
        return created;
      });
    },
    [workspaceSlug, projectId, reviewId, runSave, refreshActivities]
  );

  const deleteAttachment = useCallback(
    async (assetId: string) => {
      if (!workspaceSlug || !projectId || !reviewId) return;
      await runSave(async () => {
        await service.deleteFile(workspaceSlug, projectId, reviewId, assetId);
        setAttachments((current) => current.filter((item) => item.id !== assetId));
        refreshActivities();
      });
    },
    [workspaceSlug, projectId, reviewId, runSave, refreshActivities]
  );

  /** 下载与预览都走后端换预签名地址，再让浏览器自己取对象（口径同发布单附件） */
  const getAttachmentUrl = useCallback(
    async (assetId: string) => {
      if (!workspaceSlug || !projectId || !reviewId) return undefined;
      return service.getFileDownloadUrl(workspaceSlug, projectId, reviewId, assetId);
    },
    [workspaceSlug, projectId, reviewId]
  );

  const downloadAttachment = useCallback(
    async (assetId: string) => {
      const url = await getAttachmentUrl(assetId);
      if (!url) return;
      // 预签名地址带 Content-Disposition: attachment，当前页直接跳过去只会触发下载、不会离开页面；
      // 用 window.open 开新标签会先闪出一个空白页再自己关掉
      const link = document.createElement("a");
      link.href = url;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    [getAttachmentUrl]
  );

  const createComment = useCallback(
    async (commentHtml: string) => {
      if (!workspaceSlug || !projectId || !reviewId) return undefined;
      // 评论要锁住发送按钮，防止连点发两条，所以这里仍然翻 isMutating
      setIsMutating(true);
      try {
        return await runSave(async () => {
          const created = await service.createComment(workspaceSlug, projectId, reviewId, {
            comment_html: commentHtml,
          });
          setComments((current) => [...current, created]);
          refreshActivities();
          return created;
        });
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, projectId, reviewId, runSave, refreshActivities]
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
    saveState,
    retryLastSave,
    updateReview,
    advance,
    rollback,
    uploadAttachment,
    deleteAttachment,
    downloadAttachment,
    getAttachmentUrl,
    createComment,
    deleteComment,
  };
};
