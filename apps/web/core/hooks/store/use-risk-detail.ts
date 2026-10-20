import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TRiskActivity,
  TRiskAttachment,
  TRiskComment,
  TRiskDetail,
  TRiskLinkedIssue,
  TUpdateRiskPayload,
} from "@plane/types";
import { RiskService } from "@/services/risk.service";
import { RISK_PENDING_POLL_INTERVAL_MS, RISK_PENDING_POLL_MAX, getRiskError } from "./use-risks";

const service = new RiskService();

/** 「已保存」停留多久再收起 */
const SAVED_VISIBLE_MS = 2000;

/** 抽屉顶栏的保存状态：字段、附件、评论、关联这类「随手改」的写入走它，不弹成功 toast */
export type TRiskSaveState = "idle" | "saving" | "saved" | "error";

/**
 * 抽屉 / 独立页里的一条风险：详情 + 附件 + 关联缺陷 + 评论 + 轨迹，一起拉（抽屉一屏铺开，
 * 分开管会让几个 loading 各闪一次）。update 的响应是完整详情，直接整块替换。
 *
 * `riskId` 为空表示抽屉关着：不发请求，也把上一条的数据清掉，避免下次打开先闪一帧旧数据。
 * 口径同 use-stage-review-detail。
 */
export const useRiskDetail = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  riskId: string | null
) => {
  const [detail, setDetail] = useState<TRiskDetail | null>(null);
  const [attachments, setAttachments] = useState<TRiskAttachment[]>([]);
  const [issues, setIssues] = useState<TRiskLinkedIssue[]>([]);
  const [comments, setComments] = useState<TRiskComment[]>([]);
  const [activities, setActivities] = useState<TRiskActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<TRiskSaveState>("idle");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSavesRef = useRef(0);
  const lastFailedSaveRef = useRef<(() => Promise<unknown>) | null>(null);
  /** 当前作用域（ws/pid/riskId）的代际号：切换风险后，上一条还在飞的响应一律丢掉 */
  const scopeRef = useRef("");
  const requestIdRef = useRef(0);
  const scopeKey = `${workspaceSlug ?? ""}/${projectId ?? ""}/${riskId ?? ""}`;
  scopeRef.current = scopeKey;
  const isCurrentScope = useCallback(() => scopeRef.current === scopeKey, [scopeKey]);

  const resetSaveState = useCallback(() => {
    clearTimeout(savedTimerRef.current);
    pendingSavesRef.current = 0;
    lastFailedSaveRef.current = null;
    setSaveState("idle");
  }, []);

  const fetchAll = useCallback(async () => {
    resetSaveState();
    const requestId = ++requestIdRef.current;
    if (!workspaceSlug || !projectId || !riskId) {
      setDetail(null);
      setAttachments([]);
      setIssues([]);
      setComments([]);
      setActivities([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [nextDetail, nextAttachments, nextIssues, nextComments, nextActivities] = await Promise.all([
        service.retrieve(workspaceSlug, projectId, riskId),
        service.listFiles(workspaceSlug, projectId, riskId),
        service.listIssues(workspaceSlug, projectId, riskId),
        service.listComments(workspaceSlug, projectId, riskId),
        service.listActivities(workspaceSlug, projectId, riskId),
      ]);
      // 等待期间换了风险：这批是上一条的，丢掉，否则会把新风险的详情盖成旧的
      if (requestId !== requestIdRef.current) return;
      setDetail(nextDetail);
      setAttachments(nextAttachments);
      setIssues(nextIssues);
      setComments(nextComments);
      setActivities(nextActivities);
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return;
      setError(getRiskError(requestError).message);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [workspaceSlug, projectId, riskId, resetSaveState]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => () => clearTimeout(savedTimerRef.current), []);

  /** 每次写入后补一次轨迹：那条记录是同事务写进去的，不重拉就看不到 */
  const refreshActivities = useCallback(() => {
    if (!workspaceSlug || !projectId || !riskId) return;
    void service
      .listActivities(workspaceSlug, projectId, riskId)
      .then((next) => {
        if (isCurrentScope()) setActivities(next);
      })
      .catch(() => undefined);
  }, [workspaceSlug, projectId, riskId, isCurrentScope]);

  /**
   * 晚到的旧响应不能把新状态盖回去：不是手上这条风险的一律不收，同一条按 updated_at
   * 只收不比手上旧的那份。
   */
  const applyDetail = useCallback((next: TRiskDetail) => {
    setDetail((current) => {
      if (!current) return next;
      if (current.id !== next.id) return current;
      return next.updated_at >= current.updated_at ? next : current;
    });
  }, []);

  /**
   * 推简道云还在路上（新建等编号 / 修改 / 重新同步）：隔 3 秒拉一次详情，拿到结果（编号、或失败及原因）就停，
   * 最多 1 分钟。回填编号不推进 updated_at，applyDetail 照收；结果出来顺带补拉轨迹（编号那条）。
   */
  const isPending = detail?.sync_status === "pending";
  const pendingPollsRef = useRef(0);
  useEffect(() => {
    if (!isPending || !workspaceSlug || !projectId || !riskId) {
      pendingPollsRef.current = 0;
      return;
    }
    if (pendingPollsRef.current >= RISK_PENDING_POLL_MAX) return;
    const timer = setTimeout(() => {
      pendingPollsRef.current += 1;
      void service
        .retrieve(workspaceSlug, projectId, riskId)
        .then((next) => {
          if (!isCurrentScope()) return;
          applyDetail(next);
          if (next.sync_status !== "pending") refreshActivities();
        })
        .catch(() => undefined);
    }, RISK_PENDING_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [isPending, detail, workspaceSlug, projectId, riskId, isCurrentScope, applyDetail, refreshActivities]);

  /**
   * 「随手改」的写入：顶栏显示 保存中 → 已保存（2 秒后收起）/ 保存失败。
   * 几个保存并发时全部落地才算「已保存」；有一个失败就停在「保存失败」，直到重试成功。
   */
  const runSave = useCallback(async <T>(save: () => Promise<T>): Promise<T> => {
    clearTimeout(savedTimerRef.current);
    pendingSavesRef.current += 1;
    setSaveState("saving");
    // 记下发起时的作用域：中途换了风险，fetchAll 已把计数清零，这次的结算不能再碰计数 / 状态 / 重试回调
    const scope = scopeRef.current;
    try {
      const result = await save();
      if (scopeRef.current !== scope) return result;
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
      if (scopeRef.current !== scope) throw saveError;
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

  const updateRisk = useCallback(
    async (payload: TUpdateRiskPayload) => {
      if (!workspaceSlug || !projectId || !riskId) return undefined;
      return runSave(async () => {
        const next = await service.update(workspaceSlug, projectId, riskId, payload);
        applyDetail(next);
        refreshActivities();
        return next;
      });
    },
    [workspaceSlug, projectId, riskId, runSave, applyDetail, refreshActivities]
  );

  /** 推简道云失败后重新排队：响应是置成 pending 的详情（updated_at 不变，applyDetail 照收） */
  const resyncRisk = useCallback(async () => {
    if (!workspaceSlug || !projectId || !riskId) return undefined;
    return runSave(async () => {
      const next = await service.resync(workspaceSlug, projectId, riskId);
      applyDetail(next);
      return next;
    });
  }, [workspaceSlug, projectId, riskId, runSave, applyDetail]);

  /** 删除走明确的确认弹窗 + toast，不走顶栏保存状态 */
  const deleteRisk = useCallback(async () => {
    if (!workspaceSlug || !projectId || !riskId) return;
    setIsMutating(true);
    try {
      await service.remove(workspaceSlug, projectId, riskId);
    } finally {
      setIsMutating(false);
    }
  }, [workspaceSlug, projectId, riskId]);

  // --- 关联缺陷 ----------------------------------------------------------------

  const linkIssues = useCallback(
    async (issueIds: string[]) => {
      if (!workspaceSlug || !projectId || !riskId || issueIds.length === 0) return undefined;
      return runSave(async () => {
        const next = await service.linkIssues(workspaceSlug, projectId, riskId, issueIds);
        if (!isCurrentScope()) return next;
        setIssues(next);
        setDetail((current) => (current ? { ...current, issue_count: next.length } : current));
        refreshActivities();
        return next;
      });
    },
    [workspaceSlug, projectId, riskId, runSave, refreshActivities, isCurrentScope]
  );

  const unlinkIssue = useCallback(
    async (issueId: string) => {
      if (!workspaceSlug || !projectId || !riskId) return;
      await runSave(async () => {
        await service.unlinkIssue(workspaceSlug, projectId, riskId, issueId);
        if (!isCurrentScope()) return;
        setIssues((current) => {
          const next = current.filter((item) => item.id !== issueId);
          setDetail((detailNow) => (detailNow ? { ...detailNow, issue_count: next.length } : detailNow));
          return next;
        });
        refreshActivities();
      });
    },
    [workspaceSlug, projectId, riskId, runSave, refreshActivities, isCurrentScope]
  );

  // --- 附件 ----------------------------------------------------------------------

  const uploadAttachment = useCallback(
    async (file: File, onProgress?: (percentage: number) => void) => {
      if (!workspaceSlug || !projectId || !riskId) return undefined;
      return runSave(async () => {
        const created = await service.uploadFile(workspaceSlug, projectId, riskId, file, onProgress);
        if (!isCurrentScope()) return created;
        setAttachments((current) => [...current, created]);
        refreshActivities();
        return created;
      });
    },
    [workspaceSlug, projectId, riskId, runSave, refreshActivities, isCurrentScope]
  );

  const deleteAttachment = useCallback(
    async (assetId: string) => {
      if (!workspaceSlug || !projectId || !riskId) return;
      await runSave(async () => {
        await service.deleteFile(workspaceSlug, projectId, riskId, assetId);
        if (!isCurrentScope()) return;
        setAttachments((current) => current.filter((item) => item.id !== assetId));
        refreshActivities();
      });
    },
    [workspaceSlug, projectId, riskId, runSave, refreshActivities, isCurrentScope]
  );

  const getAttachmentUrl = useCallback(
    async (assetId: string) => {
      if (!workspaceSlug || !projectId || !riskId) return undefined;
      return service.getFileDownloadUrl(workspaceSlug, projectId, riskId, assetId);
    },
    [workspaceSlug, projectId, riskId]
  );

  const downloadAttachment = useCallback(
    async (assetId: string) => {
      const url = await getAttachmentUrl(assetId);
      if (!url) return;
      // 预签名地址带 Content-Disposition: attachment，当前页直接跳过去只触发下载不离开页面
      const link = document.createElement("a");
      link.href = url;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    [getAttachmentUrl]
  );

  // --- 评论 ----------------------------------------------------------------------

  const createComment = useCallback(
    async (commentHtml: string) => {
      if (!workspaceSlug || !projectId || !riskId) return undefined;
      // 评论要锁住发送按钮，防止连点发两条
      setIsMutating(true);
      try {
        return await runSave(async () => {
          const created = await service.createComment(workspaceSlug, projectId, riskId, {
            comment_html: commentHtml,
          });
          if (!isCurrentScope()) return created;
          setComments((current) => [...current, created]);
          refreshActivities();
          return created;
        });
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, projectId, riskId, runSave, refreshActivities, isCurrentScope]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!workspaceSlug || !projectId || !riskId) return;
      setIsMutating(true);
      try {
        await service.deleteComment(workspaceSlug, projectId, riskId, commentId);
        if (isCurrentScope()) setComments((current) => current.filter((item) => item.id !== commentId));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, projectId, riskId, isCurrentScope]
  );

  return {
    detail,
    attachments,
    issues,
    comments,
    activities,
    isLoading,
    isMutating,
    error,
    saveState,
    retryLastSave,
    refresh: fetchAll,
    updateRisk,
    resyncRisk,
    deleteRisk,
    linkIssues,
    unlinkIssue,
    uploadAttachment,
    deleteAttachment,
    downloadAttachment,
    getAttachmentUrl,
    createComment,
    deleteComment,
  };
};
