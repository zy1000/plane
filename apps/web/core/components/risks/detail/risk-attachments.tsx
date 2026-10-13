import { useCallback, useState } from "react";
import { UploadCloud } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { DropdownIcon, PlusIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRiskAttachment } from "@plane/types";
import { cn } from "@plane/utils";
import {
  RiskAttachmentDeleteModal,
  RiskAttachmentDropOverlay,
  RiskAttachmentMenu,
  RiskAttachmentRow,
  RiskAttachmentUploader,
  RiskUploadState,
} from "../attachments/risk-attachment-rows";
import { useRiskAttachmentDrop, useRiskUploadQueue } from "../attachments/use-risk-upload-queue";
import { RISK_I18N } from "../constants";
import { useRiskAttachmentPreview } from "./use-risk-attachment-preview";

/**
 * 风险附件，外形照工作项的附件小部件（issue-detail-widgets/attachments）：可折叠标题「▾ 附件 N」+ 右侧「+」，
 * 行是 文件图标 · 名称 · 大小，右侧上传人头像，悬停出「⋯」（下载 / 删除，删除要确认）；整行点开预览。
 * 整块可拖入上传，可多选，逐个上传，正在传的排在最前面。走 FileAsset 预签名两步上传，文件不经过 Django。
 *
 * 不嵌套按钮：标题的折叠按钮和「+」是两个并排的按钮（工作项那版是按钮套按钮）。
 * 访客（editable=false）只能预览与下载。
 */
export const RiskAttachments = ({
  workspaceSlug,
  projectId,
  attachments,
  editable,
  onUpload,
  onDownload,
  onDelete,
  getFileURL,
}: {
  workspaceSlug: string;
  projectId: string;
  attachments: TRiskAttachment[];
  editable: boolean;
  onUpload: (file: File, onProgress: (percentage: number) => void) => Promise<unknown>;
  onDownload: (assetId: string) => void;
  onDelete: (assetId: string) => Promise<unknown>;
  getFileURL: (assetId: string) => Promise<string | undefined>;
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);
  const [deleting, setDeleting] = useState<TRiskAttachment | null>(null);
  const { requestPreview, previewModals } = useRiskAttachmentPreview({ workspaceSlug, projectId, getFileURL });
  const { items: uploads, add, run } = useRiskUploadQueue();

  const handleFiles = useCallback(
    (files: File[]) => {
      setIsOpen(true);
      const created = add(files, "queued");
      void run(created, onUpload, { removeSettled: true }).then((failed) => {
        if (failed.length === 0) return;
        setToast({ type: TOAST_TYPE.ERROR, title: t(`${RISK_I18N}.detail.upload_failed`), message: failed.join("、") });
      });
    },
    [add, run, onUpload, t]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useRiskAttachmentDrop({
    disabled: !editable,
    onFiles: handleFiles,
  });

  const isEmpty = attachments.length === 0 && uploads.length === 0;
  const uploadLabel = t(`${RISK_I18N}.detail.upload`);

  return (
    <section className="-mx-2.5 flex flex-col">
      {previewModals}
      <RiskAttachmentDeleteModal
        asset={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={(asset) => onDelete(asset.id)}
      />

      {/* 标题行：同 @plane/ui 的 CollapsibleButton（h-12、8px 三角、标题 + 灰色计数） */}
      <div className="flex h-12 items-center gap-3 px-2.5">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
          className="flex min-w-0 items-center gap-3"
        >
          <DropdownIcon
            className={cn("size-2 text-tertiary transition-transform duration-300 hover:text-secondary", !isOpen && "-rotate-90")}
          />
          <span className="text-14 font-semibold text-primary">{t(`${RISK_I18N}.detail.attachments`)}</span>
          <span className="text-14 text-tertiary tabular-nums">{attachments.length}</span>
        </button>
        {editable && isOpen && (
          <Tooltip tooltipContent={uploadLabel} position="top">
            <button
              type="button"
              aria-label={uploadLabel}
              onClick={open}
              className="ml-auto grid size-7 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
            >
              <PlusIcon className="size-4" />
            </button>
          </Tooltip>
        )}
      </div>

      {isOpen && (
        <div
          {...getRootProps()}
          className={cn("relative flex flex-col", isDragActive && attachments.length < 3 && "min-h-[120px]")}
        >
          <input {...getInputProps()} />
          {isDragActive && <RiskAttachmentDropOverlay />}

          {uploads.map((item) => (
            <RiskAttachmentRow key={item.id} variant="widget" name={item.file.name}>
              <RiskUploadState item={item} variant="widget" />
            </RiskAttachmentRow>
          ))}

          {attachments.map((asset) => (
            <RiskAttachmentRow
              key={asset.id}
              variant="widget"
              name={asset.name}
              size={asset.size}
              onClick={() => void requestPreview(asset)}
            >
              <RiskAttachmentUploader asset={asset} />
              <RiskAttachmentMenu
                onDownload={() => onDownload(asset.id)}
                onDelete={editable ? () => setDeleting(asset) : undefined}
              />
            </RiskAttachmentRow>
          ))}

          {isEmpty &&
            (editable ? (
              // 空态一行灰字可点，点了开文件选择；拖文件进来也落在这里
              <button
                type="button"
                onClick={open}
                className="flex h-9 w-fit max-w-full items-center gap-2 rounded-md pr-2 pl-9 text-14 text-placeholder transition-colors hover:text-secondary"
              >
                <UploadCloud className="size-3.5" />
                {t(`${RISK_I18N}.detail.upload_hint`)}
              </button>
            ) : (
              <p className="flex h-9 items-center pl-9 text-14 text-placeholder">
                {t(`${RISK_I18N}.detail.no_attachments`)}
              </p>
            ))}
        </div>
      )}
    </section>
  );
};
