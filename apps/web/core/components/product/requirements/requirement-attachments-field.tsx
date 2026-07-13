import { useCallback, useState } from "react";
import { AlertCircle, Download, LoaderCircle, Plus, Trash2, UploadCloud } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { EFileAssetType } from "@plane/types";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { convertBytesToSize, getFileExtension } from "@plane/utils";
import { getFileIcon } from "@/components/icons";
import { useFileSize } from "@/plane-web/hooks/use-file-size";
import { FileService } from "@/services/file.service";
import type { TRequirementAttachment } from "@/services/requirement.service";

const fileService = new FileService();

type Props = {
  workspaceSlug: string;
  productId: string;
  requirementId?: string;
  attachments: TRequirementAttachment[];
  onUpload: (attachment: TRequirementAttachment) => void;
  onRemove: (attachmentId: string) => void;
};

export function RequirementAttachmentsField(props: Props) {
  const { attachments, onRemove, onUpload, productId, requirementId, workspaceSlug } = props;
  const { maxFileSize } = useFileSize();
  const [uploadingCount, setUploadingCount] = useState(0);

  const onDrop = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploadingCount((count) => count + files.length);
      try {
        const results = await Promise.allSettled(
          files.map((file) =>
            fileService.uploadProductAsset(
              workspaceSlug,
              productId,
              {
                entity_identifier: requirementId ?? productId,
                entity_type: EFileAssetType.REQUIREMENT_ATTACHMENT,
              },
              file
            )
          )
        );
        results.forEach((result, index) => {
          if (result.status !== "fulfilled") return;
          const file = files[index];
          if (!file) return;
          onUpload({
            id: result.value.asset_id,
            attributes: { name: file.name, size: file.size, type: file.type },
            asset_url: result.value.asset_url,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: null,
          });
        });
        const failedCount = results.filter((result) => result.status === "rejected").length;
        if (failedCount > 0) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "附件上传失败",
            message: `${failedCount} 个文件未能上传，请重试。`,
          });
        }
      } finally {
        setUploadingCount((count) => Math.max(0, count - files.length));
      }
    },
    [onUpload, productId, requirementId, workspaceSlug]
  );

  const { fileRejections, getInputProps, getRootProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: maxFileSize,
    multiple: true,
    disabled: uploadingCount > 0,
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        aria-busy={uploadingCount > 0}
        aria-label="上传需求附件"
        className={`group relative cursor-pointer overflow-hidden rounded-lg border border-dashed transition-colors duration-200 focus-within:border-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30 ${
          isDragActive
            ? "border-accent-strong bg-accent-primary/10"
            : "border-subtle bg-surface-1 hover:border-accent-strong hover:bg-accent-primary/5"
        } ${uploadingCount > 0 ? "cursor-wait" : ""}`}
      >
        <input {...getInputProps()} />
        <div className="flex min-h-20 items-center gap-3 px-3.5 py-3">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-lg transition-colors duration-200 ${
              isDragActive ? "bg-accent-primary text-on-color" : "bg-layer-1 text-secondary group-hover:text-accent-primary"
            }`}
          >
            {uploadingCount > 0 ? (
              <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" />
            ) : (
              <UploadCloud className="size-5" />
            )}
          </span>

          <div className="min-w-0 flex-1 text-left">
            <p aria-live="polite" className="text-12 font-medium text-primary">
              {uploadingCount > 0
                ? `正在上传 ${uploadingCount} 个文件`
                : isDragActive
                  ? "松开鼠标，添加到需求"
                  : "拖入文件，或点击选择"}
            </p>
            <p className="mt-0.5 text-11 leading-4 text-tertiary">
              支持同时上传多个文件，单个不超过 {Math.round(maxFileSize / 1024 / 1024)} MB
            </p>
          </div>

          {uploadingCount === 0 && (
            <span className="grid size-8 shrink-0 place-items-center rounded-md border border-subtle bg-surface-1 text-tertiary transition-colors group-hover:border-accent-strong group-hover:text-accent-primary">
              <Plus className="size-4" />
            </span>
          )}
        </div>
      </div>
      {fileRejections.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-danger-primary/10 px-3 py-2 text-11 text-danger-primary"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <p>部分文件超过大小限制，未上传。请压缩文件或重新选择。</p>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-subtle bg-surface-1">
          <div className="flex items-center justify-between border-b border-subtle bg-layer-1/60 px-3 py-2">
            <p className="text-11 font-medium text-secondary">已添加的文件</p>
            <span className="rounded-full bg-surface-1 px-2 py-0.5 text-10 font-medium text-tertiary">
              {attachments.length} 个
            </span>
          </div>

          <div className="divide-y divide-subtle">
            {attachments.map((attachment) => {
              const fileName = attachment.attributes.name ?? "附件";
              const fileExtension = getFileExtension(fileName);
              return (
                <div
                  key={attachment.id}
                  className="group/file flex min-h-12 items-center gap-2.5 px-2.5 py-2 transition-colors hover:bg-layer-1/70"
                >
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md bg-layer-1">
                    {getFileIcon(fileExtension, 20)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-12 font-medium text-primary" title={fileName}>
                      {fileName}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-10 text-tertiary">
                      <span>{fileExtension ? fileExtension.toUpperCase() : "文件"}</span>
                      <span className="size-0.5 rounded-full bg-tertiary" />
                      <span>{convertBytesToSize(Number(attachment.attributes.size ?? 0))}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`下载附件 ${fileName}`}
                      onClick={() =>
                        window.open(
                          fileService.getProductAssetDownloadUrl(workspaceSlug, productId, attachment.id),
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                    >
                      <Download className="size-3.5 text-tertiary transition-colors group-hover/file:text-secondary" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="group/remove"
                      aria-label={`移除附件 ${fileName}`}
                      onClick={() => onRemove(attachment.id)}
                    >
                      <Trash2 className="size-3.5 text-tertiary transition-colors group-hover/remove:text-danger-primary" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
