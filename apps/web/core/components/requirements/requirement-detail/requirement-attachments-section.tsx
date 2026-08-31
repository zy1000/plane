/**
 * 需求级附件区。每条需求天然自带，不依赖需求类型配的附件字段；只在详情抽屉与整页出现，
 * 网格里没有它。
 *
 * 附件**算内容**：列表存在行上的 attachments 列，增删都走 onPatch（乐观锁 + 评审中 / 已关闭
 * 闸门 + 版本快照），所以这里的读写权限就是 readOnly，不另开一道门。删除只是从列表里去掉，
 * 不删资产 —— 旧版本快照还引用着它，回滚后要能下载。
 *
 * 物理文件复用 REQUIREMENT_ATTACHMENT 资产（挂在产品 / 标准库上），上传器与富文本贴图、
 * 附件字段同一份（useRequirementAssetUpload）；单个下载走工作区级资产端点，只有多选打
 * ZIP 才需要需求侧自己的端点。
 */
import { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Download, Eye, Paperclip, Trash2, Upload, UploadCloud } from "lucide-react";
import type { FileRejection } from "react-dropzone";
import { useDropzone } from "react-dropzone";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirementAssetRef } from "@plane/types";
import { AlertModalCore, Checkbox, CustomMenu } from "@plane/ui";
import { cn, convertBytesToSize, getEditorAssetDownloadSrc, getFileExtension, renderFormattedDate } from "@plane/utils";
import { FileUploadProgressList } from "@/components/common/file-upload-progress-item";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { getFileIcon } from "@/components/icons";
import { useRequirementAssetUpload } from "@/components/requirements/use-requirement-asset-upload";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useMember } from "@/hooks/store/use-member";
import { useAttachmentBatchDownload } from "@/hooks/use-attachment-batch-download";
import { useFileSelection } from "@/hooks/use-file-selection";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useFileSize } from "@/plane-web/hooks/use-file-size";
import { RequirementService } from "@/services/requirement.service";
import { SECTION_ACTION_BUTTON } from "./requirement-detail-section";
import { RequirementRelationCollapsible } from "./requirement-relation-collapsible";
import { useRequirementAttachmentPreview } from "./use-requirement-attachment-preview";

const requirementService = new RequirementService();

type TProps = {
  workspaceSlug: string;
  /** 资产的归属方：产品或标准库的 id */
  entityId: string;
  entityKind: "product" | "library";
  requirementId: string;
  attachments: TRequirementAssetRef[];
  readOnly: boolean;
  /** 整组替换；给更新函数而不是新数组，排队与冲突重放都按最新的行算 */
  onChange: (updater: (current: TRequirementAssetRef[]) => TRequirementAssetRef[]) => void;
};

const AttachmentRow = ({
  asset,
  selected,
  onToggleSelect,
  onPreview,
  onDelete,
  workspaceSlug,
}: {
  asset: TRequirementAssetRef;
  selected: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
  /** 不传 = 只读，菜单里没有删除 */
  onDelete?: () => void;
  workspaceSlug: string;
}) => {
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const { isMobile } = usePlatformOS();
  const downloadHref = getEditorAssetDownloadSrc({ assetId: asset.asset_id, workspaceSlug }) ?? "";
  const uploader = asset.created_by ? getUserDetails(asset.created_by)?.display_name : undefined;

  return (
    <div className="group flex min-h-10 items-center gap-2 py-1 pr-2 pl-1.5 transition-colors hover:bg-surface-2">
      <Checkbox
        className="size-3.5 shrink-0 !outline-none"
        iconClassName="size-3"
        checked={selected}
        onChange={onToggleSelect}
      />
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onPreview}
        title={t("requirement_detail.attachments.preview")}
      >
        <span className="flex shrink-0 items-center">{getFileIcon(getFileExtension(asset.name), 18)}</span>
        <Tooltip tooltipContent={asset.name} isMobile={isMobile}>
          <span className="truncate text-body-xs-medium text-primary">{asset.name}</span>
        </Tooltip>
        <span className="shrink-0 text-caption-md-regular text-tertiary">{convertBytesToSize(asset.size)}</span>
      </button>
      {asset.created_by && (
        <Tooltip
          isMobile={isMobile}
          tooltipContent={t("requirement_detail.attachments.uploaded_by", {
            name: uploader ?? "",
            date: asset.created_at ? renderFormattedDate(asset.created_at) : "",
          })}
        >
          <div className="flex items-center justify-center">
            <ButtonAvatars showTooltip userIds={asset.created_by} />
          </div>
        </Tooltip>
      )}
      <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <CustomMenu ellipsis closeOnSelect placement="bottom-end">
          <CustomMenu.MenuItem onClick={onPreview}>
            <div className="flex items-center gap-2">
              <Eye className="size-3.5" strokeWidth={1.75} />
              <span>{t("requirement_detail.attachments.preview")}</span>
            </div>
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem onClick={() => window.open(downloadHref, "_blank", "noopener,noreferrer")}>
            <div className="flex items-center gap-2">
              <Download className="size-3.5" strokeWidth={1.75} />
              <span>{t("requirement_detail.attachments.download")}</span>
            </div>
          </CustomMenu.MenuItem>
          {onDelete && (
            <CustomMenu.MenuItem onClick={onDelete}>
              <div className="flex items-center gap-2 text-danger-primary">
                <Trash2 className="size-3.5" strokeWidth={1.75} />
                <span>{t("requirement_detail.attachments.delete")}</span>
              </div>
            </CustomMenu.MenuItem>
          )}
        </CustomMenu>
      </div>
    </div>
  );
};

export const RequirementAttachmentsSection = observer(function RequirementAttachmentsSection({
  workspaceSlug,
  entityId,
  entityKind,
  requirementId,
  attachments,
  readOnly,
  onChange,
}: TProps) {
  const { t } = useTranslation();
  const { maxFileSize } = useFileSize();
  const uploadAsset = useRequirementAssetUpload({ workspaceSlug, entityId });
  const { getAssetUploadStatusByEditorBlockId } = useEditorAsset();
  const { requestPreview, previewModals } = useRequirementAttachmentPreview({ workspaceSlug });

  // 上传中的 blockId；进度本身在 editor asset store 里，这里只记「有哪些在飞」
  const [uploadingIds, setUploadingIds] = useState<string[]>([]);
  const uploadStatuses = uploadingIds
    .map((blockId) => getAssetUploadStatusByEditorBlockId(blockId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const [assetToDelete, setAssetToDelete] = useState<TRequirementAssetRef | null>(null);

  const selectable = useMemo(() => attachments.map((asset) => ({ id: asset.asset_id })), [attachments]);
  const selection = useFileSelection(selectable);

  const { isBatchDownloading, batchDownload } = useAttachmentBatchDownload({
    filename: "requirement-attachments.zip",
    fetchZip: (assetIds) =>
      requirementService.batchDownloadRequirementAttachments(
        workspaceSlug,
        { kind: entityKind, id: entityId },
        requirementId,
        assetIds
      ),
    onError: (message) =>
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("requirement_detail.attachments.toast_batch_download_failed"),
        message,
      }),
    onSuccess: selection.clear,
  });

  const uploadFile = useCallback(
    async (file: File) => {
      const blockId = uuidv4();
      setUploadingIds((current) => [...current, blockId]);
      try {
        const ref = await uploadAsset(file, false, blockId);
        onChange((current) => [...current, ref]);
      } catch (error) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("requirement_detail.attachments.toast_upload_failed"),
          message: (error as { error?: string } | null)?.error ?? file.name,
        });
      } finally {
        setUploadingIds((current) => current.filter((id) => id !== blockId));
      }
    },
    [onChange, t, uploadAsset]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message: t("attachment.file_size_limit", { size: maxFileSize / 1024 / 1024 }),
        });
      }
      acceptedFiles.forEach((file) => void uploadFile(file));
    },
    [maxFileSize, t, uploadFile]
  );

  // noClick：行本身要响应预览点击，选文件只从「上传」按钮走
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    maxSize: maxFileSize,
    multiple: true,
    disabled: readOnly,
    noClick: true,
    noKeyboard: true,
  });

  const handleDelete = () => {
    if (!assetToDelete) return;
    const assetId = assetToDelete.asset_id;
    onChange((current) => current.filter((item) => item.asset_id !== assetId));
    setAssetToDelete(null);
  };

  // 折叠头的动作区在折叠态也保留；只读且没选中任何附件时什么都不放，免得留个空容器
  const actions =
    selection.selectedCount > 0 || !readOnly ? (
      <>
        {selection.selectedCount > 0 && (
          <button
            type="button"
            className={SECTION_ACTION_BUTTON}
            disabled={isBatchDownloading}
            onClick={() => void batchDownload(selection.selectedIds)}
          >
            <Download className="size-3.5" />
            {t("requirement_detail.attachments.download_selected", { count: selection.selectedCount })}
          </button>
        )}
        {!readOnly && (
          <button type="button" className={SECTION_ACTION_BUTTON} onClick={open}>
            <Upload className="size-3.5" />
            {t("requirement_detail.attachments.upload")}
          </button>
        )}
      </>
    ) : undefined;

  return (
    <>
      {previewModals}
      <RequirementRelationCollapsible
        title={t("requirement_detail.attachments.title")}
        icon={Paperclip}
        count={attachments.length}
        actions={actions}
      >
        <div {...getRootProps()} className={cn("relative flex flex-col", isDragActive && "min-h-24")}>
          <input {...getInputProps()} />
          {isDragActive && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-surface-2/75">
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-strong bg-surface-1 px-5 py-4">
                <UploadCloud className="size-6 text-tertiary" />
                <span className="text-body-xs-regular text-tertiary">
                  {t("requirement_detail.attachments.drop_hint")}
                </span>
              </div>
            </div>
          )}
          <FileUploadProgressList uploadStatuses={uploadStatuses} className="flex flex-col gap-1 px-2.5 pt-1" />
          {attachments.length ? (
            <div className="pb-1">
              {attachments.map((asset) => (
                <AttachmentRow
                  key={asset.asset_id}
                  asset={asset}
                  workspaceSlug={workspaceSlug}
                  selected={selection.isSelected(asset.asset_id)}
                  onToggleSelect={() => selection.toggle(asset.asset_id)}
                  onPreview={() => requestPreview(asset)}
                  onDelete={readOnly ? undefined : () => setAssetToDelete(asset)}
                />
              ))}
            </div>
          ) : (
            !uploadStatuses.length && (
              <p className="px-2.5 py-2.5 text-body-xs-regular text-placeholder">
                {t("requirement_detail.attachments.empty")}
              </p>
            )
          )}
        </div>
      </RequirementRelationCollapsible>
      <AlertModalCore
        isOpen={Boolean(assetToDelete)}
        handleClose={() => setAssetToDelete(null)}
        handleSubmit={handleDelete}
        isSubmitting={false}
        title={t("requirement_detail.attachments.delete_confirm_title")}
        content={t("requirement_detail.attachments.delete_confirm_description", { name: assetToDelete?.name ?? "" })}
      />
    </>
  );
});
