import { useState } from "react";
import type { ReactNode } from "react";
import { Check, Download, UploadCloud } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TrashIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRiskAttachment } from "@plane/types";
import { AlertModalCore, Avatar, CircularProgressIndicator, CustomMenu } from "@plane/ui";
import { cn, convertBytesToSize, getFileExtension, getFileURL, renderFormattedDate } from "@plane/utils";
import { getUserAvatarFallbackBackgroundColor } from "@/helpers/user-avatar.helper";
import { getFileIcon } from "@/components/icons";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { RISK_I18N } from "../constants";
import type { TRiskUploadItem } from "./use-risk-upload-queue";

/**
 * 附件行，照工作项附件（issues/attachment/attachment-list-item.tsx）：文件图标 · 名称 · 大小，右侧放状态 / 头像 / 「⋯」。
 * - widget：详情页小部件，行左缩进让图标对到标题文字下面，悬停浅底
 * - boxed：弹窗里一个边框盒子，行间细线
 */
export type TRiskAttachmentRowVariant = "widget" | "boxed";

const ROW_CLASS: Record<TRiskAttachmentRowVariant, string> = {
  widget: "h-11 rounded-md pr-2 pl-9",
  boxed: "h-11 border-t border-subtle px-3.5 first:border-t-0",
};

export const RiskAttachmentRow = ({
  variant,
  name,
  size,
  onClick,
  children,
}: {
  variant: TRiskAttachmentRowVariant;
  name: string;
  size?: number;
  /** 整行点击（预览）；不传就不可点 */
  onClick?: () => void;
  /** 右侧：上传状态 / 上传人 / 菜单 */
  children?: ReactNode;
}) => {
  const { isMobile } = usePlatformOS();
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      className={cn(
        "group flex shrink-0 items-center gap-3 text-13 transition-colors hover:bg-surface-2",
        onClick && "cursor-pointer",
        ROW_CLASS[variant]
      )}
    >
      <span className="flex shrink-0">{getFileIcon(getFileExtension(name), 18)}</span>
      <Tooltip tooltipContent={name} isMobile={isMobile}>
        <span className="min-w-0 truncate font-medium text-secondary">{name}</span>
      </Tooltip>
      {size !== undefined && (
        <>
          <span className="size-1.5 shrink-0 rounded-full bg-layer-3" />
          <span className="shrink-0 text-placeholder tabular-nums">{convertBytesToSize(size)}</span>
        </>
      )}
      <span className="flex-1" />
      {/* 右侧操作不冒泡到整行，点菜单 / 头像不触发预览 */}
      <div className="flex shrink-0 items-center gap-3" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
};

/** 还没进附件列表的文件：待上传 / 等待上传 / 进度 / 已上传 / 上传失败 */
export const RiskUploadState = ({
  item,
  variant,
  onRemove,
}: {
  item: TRiskUploadItem;
  variant: TRiskAttachmentRowVariant;
  /** 只有「待上传」能移除 */
  onRemove?: () => void;
}) => {
  const { t } = useTranslation();
  switch (item.status) {
    case "pending":
      return (
        <>
          <span className="inline-flex h-5.5 items-center rounded-md bg-layer-3 px-1.75 text-12 font-medium text-tertiary">
            {t(`${RISK_I18N}.form.attachment_pending`)}
          </span>
          {onRemove && (
            <button
              type="button"
              aria-label={`${t(`${RISK_I18N}.form.attachment_remove`)} · ${item.file.name}`}
              onClick={onRemove}
              className="-mr-1.5 grid size-6.5 place-items-center rounded-md text-placeholder hover:bg-layer-transparent-hover hover:text-secondary"
            >
              <span aria-hidden="true" className="text-16 leading-none">
                ×
              </span>
            </button>
          )}
        </>
      );
    case "queued":
      return <span className="text-12 text-placeholder">{t(`${RISK_I18N}.form.attachment_queued`)}</span>;
    case "uploading":
      return (
        <span className="flex items-center gap-2">
          <CircularProgressIndicator size={18} strokeWidth={3} percentage={item.progress} />
          <span className="text-12 text-tertiary tabular-nums">
            {variant === "widget"
              ? t(`${RISK_I18N}.detail.upload_progress`, { percent: item.progress })
              : `${item.progress}%`}
          </span>
        </span>
      );
    case "done":
      return (
        <span className="flex items-center gap-1 text-12 text-success-primary">
          <Check className="size-3.5" strokeWidth={2.4} />
          {t(`${RISK_I18N}.form.attachment_done`)}
        </span>
      );
    case "failed":
      return <span className="text-12 text-danger-primary">{t(`${RISK_I18N}.form.attachment_failed`)}</span>;
  }
};

/** 上传人头像，悬停「张三 于 2026年10月13日 上传」 */
export const RiskAttachmentUploader = ({ asset }: { asset: TRiskAttachment }) => {
  const { t, currentLocale } = useTranslation();
  const { isMobile } = usePlatformOS();
  const user = asset.created_by_detail;
  if (!user) return null;
  const date = renderFormattedDate(asset.created_at, currentLocale.toLowerCase().startsWith("zh") ? "yyyy年M月d日" : undefined);
  return (
    <Tooltip tooltipContent={t(`${RISK_I18N}.detail.uploaded_by`, { name: user.display_name, date })} isMobile={isMobile}>
      <span className="flex">
        <Avatar
          name={user.display_name}
          src={getFileURL(user.avatar_url ?? "")}
          fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor(user)}
          showTooltip={false}
        />
      </span>
    </Tooltip>
  );
};

/** 悬停才出的「⋯」：下载、删除（不传 onDelete 就只有下载） */
export const RiskAttachmentMenu = ({ onDownload, onDelete }: { onDownload: () => void; onDelete?: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <CustomMenu ellipsis closeOnSelect placement="bottom-end">
        <CustomMenu.MenuItem onClick={onDownload}>
          <div className="flex items-center gap-2">
            <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t(`${RISK_I18N}.detail.download`)}</span>
          </div>
        </CustomMenu.MenuItem>
        {onDelete && (
          <CustomMenu.MenuItem onClick={onDelete}>
            <div className="flex items-center gap-2 text-danger-primary">
              <TrashIcon className="h-3.5 w-3.5" strokeWidth={2} />
              <span>{t("common.actions.delete")}</span>
            </div>
          </CustomMenu.MenuItem>
        )}
      </CustomMenu>
    </div>
  );
};

/** 删除附件的确认框 */
export const RiskAttachmentDeleteModal = ({
  asset,
  onClose,
  onConfirm,
}: {
  asset: TRiskAttachment | null;
  onClose: () => void;
  onConfirm: (asset: TRiskAttachment) => Promise<unknown>;
}) => {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  return (
    <AlertModalCore
      isOpen={Boolean(asset)}
      handleClose={onClose}
      handleSubmit={() => {
        if (!asset) return;
        setIsSubmitting(true);
        void onConfirm(asset)
          .catch(() => undefined)
          .finally(() => {
            setIsSubmitting(false);
            onClose();
          });
      }}
      isSubmitting={isSubmitting}
      title={t(`${RISK_I18N}.detail.delete_attachment`)}
      content={t(`${RISK_I18N}.detail.delete_attachment_confirm`, { name: asset?.name ?? "" })}
      primaryButtonText={{ default: t("common.actions.delete"), loading: t("loading") }}
      secondaryButtonText={t("cancel")}
    />
  );
};

/** 文件拖进来时盖在列表上的提示（同工作项） */
export const RiskAttachmentDropOverlay = () => {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center rounded-md bg-surface-2/75">
      <div className="flex items-center justify-center rounded-md bg-surface-1 p-1">
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-strong px-5 py-6">
          <UploadCloud className="size-7" />
          <span className="text-13 text-tertiary">{t("attachment.drag_and_drop")}</span>
        </div>
      </div>
    </div>
  );
};
