import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { PlusIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRiskAttachment } from "@plane/types";
import { ModalFieldLabel } from "@/components/common/form-modal";
import {
  RiskAttachmentDeleteModal,
  RiskAttachmentDropOverlay,
  RiskAttachmentMenu,
  RiskAttachmentRow,
  RiskAttachmentUploader,
  RiskUploadState,
} from "../attachments/risk-attachment-rows";
import { useRiskAttachmentDrop } from "../attachments/use-risk-upload-queue";
import { RISK_I18N } from "../constants";
import type { TRiskFormAttachments } from "./use-risk-form-attachments";

/**
 * 弹窗左栏最后一个字段「附件」。没有文件时是一块虚线拖放框；有文件后是边框盒子，一行一个，
 * 盒子底部一条虚线「继续拖进来 / 点击上传」。整块都是拖放落点。
 * `locked`：新建后正在上传，不能再加也不能移除。
 */
export const RiskFormAttachments = ({ state, locked }: { state: TRiskFormAttachments; locked: boolean }) => {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState<TRiskAttachment | null>(null);
  const { getRootProps, getInputProps, isDragActive, open } = useRiskAttachmentDrop({
    disabled: locked,
    onFiles: state.addFiles,
  });

  const count = state.items.length + state.attachments.length;
  const dropHint = (
    <>
      {t(`${RISK_I18N}.form.attachments_drop`)}
      <span className="font-medium text-accent-primary">{t(`${RISK_I18N}.form.attachments_click`)}</span>
    </>
  );

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <ModalFieldLabel note={count > 0 ? <span className="text-12 tabular-nums">{count}</span> : undefined}>
          {t(`${RISK_I18N}.form.attachments`)}
        </ModalFieldLabel>
        {count > 0 && (
          <button
            type="button"
            onClick={open}
            disabled={locked}
            className="-mt-1 inline-flex h-6.5 items-center gap-1 rounded-md px-2 text-13 font-medium text-accent-primary transition-colors hover:bg-layer-transparent-hover disabled:cursor-default disabled:text-placeholder disabled:hover:bg-transparent"
          >
            <PlusIcon className="size-3.5" />
            {t(`${RISK_I18N}.detail.upload`)}
          </button>
        )}
      </div>

      <div {...getRootProps()} className="relative">
        <input {...getInputProps()} />
        {isDragActive && <RiskAttachmentDropOverlay />}

        {count > 0 ? (
          <div className="overflow-hidden rounded-[10px] border border-subtle-1 bg-surface-1">
            {state.items.map((item) => (
              <RiskAttachmentRow key={item.id} variant="boxed" name={item.file.name} size={item.file.size}>
                <RiskUploadState
                  item={item}
                  variant="boxed"
                  onRemove={locked ? undefined : () => state.removePending(item.id)}
                />
              </RiskAttachmentRow>
            ))}
            {state.attachments.map((asset) => (
              <RiskAttachmentRow key={asset.id} variant="boxed" name={asset.name} size={asset.size}>
                <RiskAttachmentUploader asset={asset} />
                <RiskAttachmentMenu
                  onDownload={() => void state.downloadAttachment(asset).catch(() => undefined)}
                  onDelete={() => setDeleting(asset)}
                />
              </RiskAttachmentRow>
            ))}
            {!locked && (
              <button
                type="button"
                onClick={open}
                className="flex h-10 w-full items-center justify-center gap-1.75 border-t border-dashed border-subtle-1 text-13 text-placeholder transition-colors hover:text-secondary"
              >
                <UploadCloud className="size-3.5" />
                {dropHint}
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={open}
            disabled={locked}
            className="flex h-23 w-full items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-subtle-1 bg-surface-2 text-13 text-tertiary transition-colors hover:border-strong"
          >
            <UploadCloud className="size-4.5 text-placeholder" />
            {dropHint}
            <span className="text-12 text-placeholder">{t(`${RISK_I18N}.form.attachments_multiple`)}</span>
          </button>
        )}
      </div>

      <RiskAttachmentDeleteModal
        asset={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={(asset) =>
          state.deleteAttachment(asset).catch(() =>
            setToast({ type: TOAST_TYPE.ERROR, title: t(`${RISK_I18N}.form.failed`) })
          )
        }
      />
    </div>
  );
};
