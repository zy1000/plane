import { useRef } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewAttachment } from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
import { Block } from "./stage-review-content";

const I18N = "stage_review";

/** 248 KB / 1.1 MB 这种人读的大小 */
const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * 评审附件。走 FileAsset 的预签名两步上传，下载也是换一个预签名地址再交给浏览器 ——
 * 文件不经过 Django，口径同迭代与发布的附件。
 */
export const StageReviewAttachments = ({
  attachments,
  editable,
  isMutating,
  onUpload,
  onDownload,
  onDelete,
}: {
  attachments: TStageReviewAttachment[];
  editable: boolean;
  isMutating: boolean;
  onUpload: (file: File) => void;
  onDownload: (assetId: string) => void;
  onDelete: (assetId: string) => void;
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Block
      title={t(`${I18N}.detail.attachments_title`)}
      count={attachments.length}
      action={
        editable && (
          <button
            type="button"
            disabled={isMutating}
            onClick={() => inputRef.current?.click()}
            className="text-12 font-medium text-accent-primary transition hover:text-accent-secondary"
          >
            {t(`${I18N}.detail.upload`)}
          </button>
        )
      }
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          // 同一个文件连传两次也要触发 change
          event.target.value = "";
        }}
      />

      {attachments.length === 0 ? (
        editable ? (
          // 空态是一行虚线投放区，不是一块「还没有附件」的空提示
          <button
            type="button"
            disabled={isMutating}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border border-dashed border-subtle bg-layer-1 px-3 py-3",
              "text-13 text-tertiary transition hover:border-strong hover:text-secondary"
            )}
          >
            <Upload className="size-3.5" />
            {t(`${I18N}.detail.drop_file`)}
          </button>
        ) : (
          <p className="text-13 text-tertiary">{t(`${I18N}.detail.no_attachments`)}</p>
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {attachments.map((asset) => (
            <li
              key={asset.id}
              className="group flex items-center gap-2.5 rounded-lg border border-subtle px-3 py-2"
            >
              <span className="grid size-7.5 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-primary">
                <FileText className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-13 text-primary">{asset.name}</span>
                <span className="block text-11 tabular-nums text-tertiary">
                  {formatSize(asset.size)} · {asset.created_by_detail?.display_name ?? "—"} ·{" "}
                  {renderFormattedDate(asset.created_at)}
                </span>
              </span>
              <button
                type="button"
                title={t(`${I18N}.detail.download`)}
                className="rounded p-1 text-tertiary transition hover:bg-layer-2 hover:text-secondary"
                onClick={() => onDownload(asset.id)}
              >
                <Download className="size-3.5" />
              </button>
              {editable && (
                <button
                  type="button"
                  title={t(`${I18N}.actions.delete`)}
                  className={cn(
                    "rounded p-1 text-tertiary opacity-0 transition",
                    "hover:bg-danger-subtle hover:text-danger-primary group-hover:opacity-100"
                  )}
                  onClick={() => onDelete(asset.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
};
