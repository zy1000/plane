"use client";
import React from "react";
import Link from "next/link";
import { MoveDiagonal, MoveRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CopyLinkIcon } from "@plane/propel/icons";
import { IconButton } from "@plane/propel/icon-button";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { copyUrlToClipboard } from "@plane/utils";

type ModalHeaderProps = {
  onClose: () => void;
  caseId?: string;
  // 全屏（独立页面）链接：与工作项抽屉的 MoveDiagonal 跳独立详情页一致；同时作为「复制链接」的目标地址
  fullScreenUrl?: string;
};

/** 抽屉头部：按钮样式与位置对齐工作项 peek 抽屉（左侧：关闭 MoveRight + 全屏 MoveDiagonal；右侧：复制链接） */
export function ModalHeader({ onClose, fullScreenUrl }: ModalHeaderProps) {
  const { t } = useTranslation();

  // 与工作项 peek header 的 handleCopyText 保持一致：同一套 toast 与文案
  const handleCopyLink = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (!fullScreenUrl) return;
    copyUrlToClipboard(fullScreenUrl).then(() => {
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("common.link_copied"),
        message: t("common.link_copied_to_clipboard"),
      });
    });
  };

  return (
    <div className="relative flex items-center justify-between p-4">
      <div className="flex items-center gap-4">
        <Tooltip tooltipContent="关闭">
          <button type="button" onClick={onClose} aria-label="关闭">
            <MoveRight className="h-4 w-4 text-tertiary hover:text-secondary" />
          </button>
        </Tooltip>

        {fullScreenUrl ? (
          <Tooltip tooltipContent="全屏查看">
            <Link href={fullScreenUrl} aria-label="全屏查看">
              <MoveDiagonal className="h-4 w-4 text-tertiary hover:text-secondary" />
            </Link>
          </Tooltip>
        ) : null}
      </div>

      {fullScreenUrl ? (
        <div className="flex items-center gap-2">
          <Tooltip tooltipContent={t("common.actions.copy_link")}>
            <IconButton variant="secondary" size="lg" onClick={handleCopyLink} icon={CopyLinkIcon} aria-label="复制链接" />
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}
