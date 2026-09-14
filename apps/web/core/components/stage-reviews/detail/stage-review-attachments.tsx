import { useRef, useState } from "react";
import { Download, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewAttachment } from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
import { BLOCK_ACTION_CLASS, Block } from "./stage-review-content";

const I18N = "stage_review";

/** 248 KB / 1.1 MB 这种人读的大小 */
const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** 文件类型小方块：按扩展名配色，认不出的用通用文件图标 */
const FILE_KIND: { test: RegExp; label: string; className: string }[] = [
  { test: /\.pdf$/i, label: "PDF", className: "bg-danger-primary" },
  { test: /\.(xlsx?|csv)$/i, label: "XLS", className: "bg-success-primary" },
  { test: /\.docx?$/i, label: "DOC", className: "bg-accent-primary" },
  { test: /\.pptx?$/i, label: "PPT", className: "bg-warning-primary" },
  { test: /\.(png|jpe?g|gif|webp|svg)$/i, label: "IMG", className: "bg-layer-3 text-secondary" },
];

const FileKindIcon = ({ name }: { name: string }) => {
  const kind = FILE_KIND.find((item) => item.test.test(name));
  return (
    <span
      className={cn(
        "grid size-7.5 shrink-0 place-items-center rounded-md text-10 font-bold text-on-color",
        kind ? kind.className : "bg-layer-2 text-tertiary"
      )}
    >
      {kind ? kind.label : <FileText className="size-3.5" />}
    </span>
  );
};

/**
 * 评审附件。走 FileAsset 的预签名两步上传，下载也是换一个预签名地址再交给浏览器 ——
 * 文件不经过 Django，口径同迭代与发布的附件。
 *
 * 上传入口在区块标题右侧；空态是一条 42px 的虚线投放区（支持拖入），有文件后两列平铺。
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
  const [isDragging, setIsDragging] = useState(false);

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
            className={BLOCK_ACTION_CLASS}
          >
            <Upload className="size-3" />
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
          <button
            type="button"
            disabled={isMutating}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) onUpload(file);
            }}
            className={cn(
              "flex h-10.5 items-center justify-center gap-2 rounded-lg border border-dashed border-strong",
              "text-13 text-placeholder transition hover:border-accent-strong hover:text-tertiary",
              isDragging && "border-accent-strong bg-accent-subtle text-accent-primary"
            )}
          >
            <Paperclip className="size-3.5" />
            {t(`${I18N}.detail.drop_hint`)}
          </button>
        ) : (
          <p className="text-14 text-placeholder">{t(`${I18N}.detail.no_attachments`)}</p>
        )
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {attachments.map((asset) => (
            <li
              key={asset.id}
              className="group flex min-w-0 items-center gap-2.5 rounded-lg border border-subtle px-2.5 py-2"
            >
              <FileKindIcon name={asset.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-13 text-primary">{asset.name}</span>
                <span className="block truncate text-12 tabular-nums text-placeholder">
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
