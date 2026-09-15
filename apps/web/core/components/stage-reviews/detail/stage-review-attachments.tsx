import { useCallback, useState } from "react";
import type { FileRejection } from "react-dropzone";
import { useDropzone } from "react-dropzone";
import { Download, Paperclip, UploadCloud } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { PlusIcon, TrashIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TStageReviewAttachment } from "@plane/types";
import { AlertModalCore, CircularProgressIndicator, CustomMenu } from "@plane/ui";
import { cn, convertBytesToSize, getFileExtension, renderFormattedDate } from "@plane/utils";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { getFileIcon } from "@/components/icons";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useFileSize } from "@/plane-web/hooks/use-file-size";
import { Block } from "./stage-review-content";
import { useStageReviewAttachmentPreview } from "./use-stage-review-attachment-preview";

const I18N = "stage_review";

/** 一行附件，照工作项附件行（issues/attachment/attachment-list-item.tsx）：点整行预览，右侧上传人头像 + 悬停出「⋯」 */
const AttachmentRow = ({
  asset,
  editable,
  onPreview,
  onDownload,
  onDelete,
}: {
  asset: TStageReviewAttachment;
  editable: boolean;
  onPreview: (asset: TStageReviewAttachment) => void;
  onDownload: (assetId: string) => void;
  onDelete: (asset: TStageReviewAttachment) => void;
}) => {
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();

  return (
    <div
      role="button"
      tabIndex={0}
      className="group -mx-2 flex h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-2 hover:bg-surface-2"
      onClick={() => onPreview(asset)}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 text-13">
        <span className="flex shrink-0">{getFileIcon(getFileExtension(asset.name), 18)}</span>
        <Tooltip tooltipContent={asset.name} isMobile={isMobile}>
          <p className="truncate font-medium text-secondary">{asset.name}</p>
        </Tooltip>
        <span className="flex size-1.5 shrink-0 rounded-full bg-layer-1" />
        <span className="shrink-0 text-placeholder">{convertBytesToSize(asset.size)}</span>
      </div>

      {/* 右侧操作区不冒泡到整行，点头像 / 菜单不触发预览 */}
      <div className="flex items-center gap-3" onClick={(event) => event.stopPropagation()}>
        {asset.created_by_id && (
          <Tooltip
            isMobile={isMobile}
            tooltipContent={t(`${I18N}.detail.uploaded_by`, {
              name: asset.created_by_detail?.display_name ?? "",
              date: renderFormattedDate(asset.created_at),
            })}
          >
            <div className="flex items-center justify-center">
              <ButtonAvatars showTooltip userIds={asset.created_by_id} />
            </div>
          </Tooltip>
        )}
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <CustomMenu ellipsis closeOnSelect placement="bottom-end">
            <CustomMenu.MenuItem onClick={() => onDownload(asset.id)}>
              <div className="flex items-center gap-2">
                <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t(`${I18N}.detail.download`)}</span>
              </div>
            </CustomMenu.MenuItem>
            {editable && (
              <CustomMenu.MenuItem onClick={() => onDelete(asset)}>
                <div className="flex items-center gap-2">
                  <TrashIcon className="h-3.5 w-3.5" strokeWidth={2} />
                  <span>{t("common.actions.delete")}</span>
                </div>
              </CustomMenu.MenuItem>
            )}
          </CustomMenu>
        </div>
      </div>
    </div>
  );
};

/**
 * 评审附件，列表与交互照工作项附件：整行点开预览（Office / PDF / xmind / 图片），「⋯」里下载与删除，
 * 删除要确认，整块可拖入上传并显示进度。走 FileAsset 的预签名两步上传，文件不经过 Django。
 *
 * 标题行保持抽屉其他区块的样式，上传入口是标题右侧的「+」；空态是一条虚线投放区。
 * 已评审（editable=false）时只能预览与下载。
 */
export const StageReviewAttachments = ({
  workspaceSlug,
  projectId,
  attachments,
  editable,
  isMutating,
  onUpload,
  onDownload,
  onDelete,
  getFileURL,
}: {
  workspaceSlug: string;
  projectId: string;
  attachments: TStageReviewAttachment[];
  editable: boolean;
  isMutating: boolean;
  onUpload: (file: File, onProgress: (percentage: number) => void) => Promise<unknown>;
  onDownload: (assetId: string) => void;
  onDelete: (assetId: string) => Promise<unknown>;
  getFileURL: (assetId: string) => Promise<string | undefined>;
}) => {
  const { t } = useTranslation();
  const { maxFileSize } = useFileSize();
  const [upload, setUpload] = useState<{ name: string; progress: number } | null>(null);
  const [deleting, setDeleting] = useState<TStageReviewAttachment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { requestPreview, previewModals } = useStageReviewAttachmentPreview({ workspaceSlug, projectId, getFileURL });

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message:
            acceptedFiles.length + rejectedFiles.length > 1
              ? t("attachment.only_one_file_allowed")
              : t("attachment.file_size_limit", { size: maxFileSize / 1024 / 1024 }),
        });
        return;
      }
      const file = acceptedFiles[0];
      if (!file) return;
      setUpload({ name: file.name, progress: 0 });
      void onUpload(file, (progress) => setUpload({ name: file.name, progress })).finally(() => setUpload(null));
    },
    [maxFileSize, onUpload, t]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    maxSize: maxFileSize,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: !editable || isMutating || Boolean(upload),
  });

  const handleDelete = () => {
    if (!deleting) return;
    setIsDeleting(true);
    void onDelete(deleting.id).finally(() => {
      setIsDeleting(false);
      setDeleting(null);
    });
  };

  return (
    <Block
      title={t(`${I18N}.detail.attachments_title`)}
      count={attachments.length}
      action={
        editable && (
          <Tooltip tooltipContent={t(`${I18N}.detail.upload`)}>
            <button
              type="button"
              disabled={isMutating || Boolean(upload)}
              onClick={open}
              className="grid size-6.5 place-items-center rounded-md text-tertiary transition hover:bg-layer-2 hover:text-secondary disabled:opacity-50"
            >
              <PlusIcon className="size-4" />
            </button>
          </Tooltip>
        )
      }
    >
      {previewModals}
      <AlertModalCore
        isOpen={Boolean(deleting)}
        handleClose={() => setDeleting(null)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title={t("attachment.delete")}
        content={t(`${I18N}.detail.delete_attachment_confirm`, { name: deleting?.name ?? "" })}
      />

      <div
        {...getRootProps()}
        className={cn("relative flex flex-col", isDragActive && attachments.length < 3 && "min-h-[200px]")}
      >
        <input {...getInputProps()} />
        {isDragActive && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-surface-2/75">
            <div className="flex items-center justify-center rounded-md bg-surface-1 p-1">
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-strong px-5 py-6">
                <UploadCloud className="size-7" />
                <span className="text-13 text-tertiary">{t("attachment.drag_and_drop")}</span>
              </div>
            </div>
          </div>
        )}

        {upload && (
          <div className="pointer-events-none -mx-2 flex h-11 items-center justify-between gap-3 rounded-md bg-surface-2 px-2">
            <div className="flex min-w-0 items-center gap-3 text-13">
              <span className="shrink-0">{getFileIcon(getFileExtension(upload.name), 18)}</span>
              <p className="truncate font-medium text-secondary">{upload.name}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <CircularProgressIndicator size={20} strokeWidth={3} percentage={upload.progress} />
              <span className="text-13 font-medium tabular-nums">{upload.progress}%</span>
            </div>
          </div>
        )}

        {attachments.map((asset) => (
          <AttachmentRow
            key={asset.id}
            asset={asset}
            editable={editable}
            onPreview={(target) => void requestPreview(target)}
            onDownload={onDownload}
            onDelete={setDeleting}
          />
        ))}

        {attachments.length === 0 &&
          !upload &&
          (editable ? (
            <button
              type="button"
              disabled={isMutating}
              onClick={open}
              className={cn(
                "flex h-10.5 items-center justify-center gap-2 rounded-lg border border-dashed border-strong",
                "text-13 text-placeholder transition hover:border-accent-strong hover:text-tertiary"
              )}
            >
              <Paperclip className="size-3.5" />
              {t(`${I18N}.detail.drop_hint`)}
            </button>
          ) : (
            <p className="text-14 text-placeholder">{t(`${I18N}.detail.no_attachments`)}</p>
          ))}
      </div>
    </Block>
  );
};
