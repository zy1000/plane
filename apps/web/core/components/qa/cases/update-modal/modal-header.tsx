"use client";
import React from "react";
import Link from "next/link";
import { MoveDiagonal, MoveRight } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";

type ModalHeaderProps = {
  onClose: () => void;
  caseId?: string;
  // 全屏（独立页面）链接：与工作项抽屉的 MoveDiagonal 跳独立详情页一致
  fullScreenUrl?: string;
};

/** 抽屉头部：按钮样式与位置对齐工作项 peek 抽屉（左侧：关闭 MoveRight + 全屏 MoveDiagonal） */
export function ModalHeader({ onClose, fullScreenUrl }: ModalHeaderProps) {
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
    </div>
  );
}
