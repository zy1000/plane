import { useCallback, useRef, useState } from "react";
import type { FileRejection } from "react-dropzone";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { useFileSize } from "@/plane-web/hooks/use-file-size";

/**
 * - pending：新建弹窗里选了、还只在浏览器里（风险还没建，传不了）
 * - queued / uploading：排队 / 正在传
 * - done / failed：传完（新建弹窗里留着显示结果，详情页 / 编辑弹窗传完就拿掉）
 */
export type TRiskUploadStatus = "pending" | "queued" | "uploading" | "done" | "failed";

export type TRiskUploadItem = { id: string; file: File; status: TRiskUploadStatus; progress: number };

export type TRiskUploadFn = (file: File, onProgress: (percentage: number) => void) => Promise<unknown>;

let uploadSeq = 0;

/** 附件上传队列：逐个上传，记录每个文件的进度与成败 */
export const useRiskUploadQueue = () => {
  const [items, setItems] = useState<TRiskUploadItem[]>([]);
  // run 是异步的：要拿最新一份，不能读闭包里的 items
  const itemsRef = useRef<TRiskUploadItem[]>([]);

  const update = useCallback((updater: (current: TRiskUploadItem[]) => TRiskUploadItem[]) => {
    itemsRef.current = updater(itemsRef.current);
    setItems(itemsRef.current);
  }, []);

  const patchItem = useCallback(
    (id: string, next: Partial<TRiskUploadItem>) =>
      update((current) => current.map((item) => (item.id === id ? { ...item, ...next } : item))),
    [update]
  );

  const add = useCallback(
    (files: File[], status: "pending" | "queued") => {
      const created = files.map((file) => ({ id: `risk-upload-${(uploadSeq += 1)}`, file, status, progress: 0 }));
      update((current) => [...current, ...created]);
      return created;
    },
    [update]
  );

  const remove = useCallback((id: string) => update((current) => current.filter((item) => item.id !== id)), [update]);

  const clear = useCallback(() => update(() => []), [update]);

  const getItems = useCallback(() => itemsRef.current, []);

  /**
   * 逐个上传 `targets`，返回失败的文件名。
   * `removeSettled`：传完（成功或失败）就从队列里拿掉 —— 成功的已经出现在附件列表里了。
   */
  const run = useCallback(
    async (targets: TRiskUploadItem[], upload: TRiskUploadFn, { removeSettled = false } = {}) => {
      const failed: string[] = [];
      for (const item of targets) {
        patchItem(item.id, { status: "uploading", progress: 0 });
        try {
          await upload(item.file, (progress) => patchItem(item.id, { progress }));
          if (removeSettled) remove(item.id);
          else patchItem(item.id, { status: "done", progress: 100 });
        } catch {
          failed.push(item.file.name);
          if (removeSettled) remove(item.id);
          else patchItem(item.id, { status: "failed" });
        }
      }
      return failed;
    },
    [patchItem, remove]
  );

  return { items, add, remove, clear, getItems, run };
};

/** 附件拖放：整块是落点，`open` 给「上传」按钮用；可多选，超过大小上限的弹 toast 跳过 */
export const useRiskAttachmentDrop = ({ disabled, onFiles }: { disabled: boolean; onFiles: (files: File[]) => void }) => {
  const { t } = useTranslation();
  const { maxFileSize } = useFileSize();

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message: t("attachment.file_size_limit", { size: maxFileSize / 1024 / 1024 }),
        });
      }
      if (acceptedFiles.length > 0) onFiles(acceptedFiles);
    },
    [maxFileSize, onFiles, t]
  );

  return useDropzone({
    onDrop,
    maxSize: maxFileSize,
    multiple: true,
    noClick: true,
    noKeyboard: true,
    disabled,
  });
};

/** 预签名下载地址带 Content-Disposition: attachment，当前页点一下只触发下载不离开页面 */
export const triggerFileDownload = (url: string) => {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
};
