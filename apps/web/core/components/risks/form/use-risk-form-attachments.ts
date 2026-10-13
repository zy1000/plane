import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRiskAttachment } from "@plane/types";
import { RiskService } from "@/services/risk.service";
import { triggerFileDownload, useRiskUploadQueue } from "../attachments/use-risk-upload-queue";
import { RISK_I18N } from "../constants";

const riskService = new RiskService();

/**
 * 新建 / 编辑弹窗的附件（照 qa/execution/use-pending-execution-files.ts 的暂存写法）：
 * - 新建：风险还没 id，选的文件先留在浏览器（pending），风险建好后 `uploadPending(riskId)` 逐个传上去；
 *   取消弹窗什么也不留。
 * - 编辑：打开时拉已有附件；选了文件立即上传，删除也立即生效（点「取消」不撤回）。
 */
export const useRiskFormAttachments = ({
  workspaceSlug,
  projectId,
  riskId,
  isOpen,
}: {
  workspaceSlug: string;
  projectId: string;
  /** 编辑时的风险 id；新建时为 null */
  riskId: string | null;
  isOpen: boolean;
}) => {
  const { t } = useTranslation();
  const { items, add, remove, clear, getItems, run } = useRiskUploadQueue();
  const [attachments, setAttachments] = useState<TRiskAttachment[]>([]);

  // 每次打开清空暂存；编辑时拉已有附件
  useEffect(() => {
    if (!isOpen) return;
    clear();
    setAttachments([]);
    if (!riskId) return;
    let cancelled = false;
    riskService
      .listFiles(workspaceSlug, projectId, riskId)
      .then((list) => {
        if (!cancelled) setAttachments(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isOpen, riskId, workspaceSlug, projectId, clear]);

  const addFiles = useCallback(
    (files: File[]) => {
      if (!riskId) {
        add(files, "pending");
        return;
      }
      const created = add(files, "queued");
      void run(
        created,
        async (file, onProgress) => {
          const asset = await riskService.uploadFile(workspaceSlug, projectId, riskId, file, onProgress);
          setAttachments((current) => [...current, asset]);
        },
        { removeSettled: true }
      ).then((failed) => {
        if (failed.length === 0) return;
        setToast({ type: TOAST_TYPE.ERROR, title: t(`${RISK_I18N}.detail.upload_failed`), message: failed.join("、") });
      });
    },
    [riskId, add, run, workspaceSlug, projectId, t]
  );

  /** 新建：风险建好后把暂存的文件逐个传上去，返回失败的文件名 */
  const uploadPending = useCallback(
    (newRiskId: string) =>
      run(
        getItems().filter((item) => item.status === "pending"),
        (file, onProgress) => riskService.uploadFile(workspaceSlug, projectId, newRiskId, file, onProgress)
      ),
    [getItems, run, workspaceSlug, projectId]
  );

  const deleteAttachment = useCallback(
    async (asset: TRiskAttachment) => {
      if (!riskId) return;
      await riskService.deleteFile(workspaceSlug, projectId, riskId, asset.id);
      setAttachments((current) => current.filter((item) => item.id !== asset.id));
    },
    [riskId, workspaceSlug, projectId]
  );

  const downloadAttachment = useCallback(
    async (asset: TRiskAttachment) => {
      if (!riskId) return;
      const url = await riskService.getFileDownloadUrl(workspaceSlug, projectId, riskId, asset.id);
      if (url) triggerFileDownload(url);
    },
    [riskId, workspaceSlug, projectId]
  );

  const pendingCount = items.filter((item) => item.status === "pending").length;
  /** 正在传（含排队）：这时弹窗不能关 */
  const isUploading = items.some((item) => item.status === "queued" || item.status === "uploading");
  /** 新建后上传的进度：传完（成功或失败）几个 / 一共几个 */
  const settledCount = items.filter((item) => item.status === "done" || item.status === "failed").length;

  return {
    items,
    attachments,
    addFiles,
    removePending: remove,
    uploadPending,
    deleteAttachment,
    downloadAttachment,
    pendingCount,
    isUploading,
    settledCount,
  };
};

export type TRiskFormAttachments = ReturnType<typeof useRiskFormAttachments>;
