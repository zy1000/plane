"use client";

import * as React from "react";
import { FileText, ImageIcon, X } from "lucide-react";
import { cn } from "@plane/utils";

export const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);

const EXT_BADGES: Record<string, { label: string; className: string }> = {
  pdf: { label: "PDF", className: "bg-danger-subtle text-danger-primary" },
  xls: { label: "XLS", className: "bg-success-subtle text-success-primary" },
  xlsx: { label: "XLS", className: "bg-success-subtle text-success-primary" },
  csv: { label: "CSV", className: "bg-success-subtle text-success-primary" },
  doc: { label: "DOC", className: "bg-accent-subtle text-accent-primary" },
  docx: { label: "DOC", className: "bg-accent-subtle text-accent-primary" },
  zip: { label: "ZIP", className: "bg-warning-subtle text-warning-primary" },
  rar: { label: "RAR", className: "bg-warning-subtle text-warning-primary" },
  "7z": { label: "7Z", className: "bg-warning-subtle text-warning-primary" },
  log: { label: "LOG", className: "bg-layer-3 text-secondary" },
  txt: { label: "TXT", className: "bg-layer-3 text-secondary" },
};

const BADGE_SIZE = {
  sm: { box: "size-[26px] rounded-[5px] text-[9px]", icon: 14 },
  md: { box: "size-8 rounded-[5px] text-10", icon: 16 },
  lg: { box: "size-9 rounded-md text-10", icon: 18 },
} as const;

/** 按扩展名出的文件类型小方块：图片给图标，常见文档给三字母标签 */
export const FileTypeBadge: React.FC<{ name: string; size?: keyof typeof BADGE_SIZE }> = ({ name, size = "md" }) => {
  const ext = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
  const { box, icon } = BADGE_SIZE[size];
  const base = `flex shrink-0 items-center justify-center font-semibold tracking-wide ${box}`;
  if (IMAGE_EXTS.has(ext)) {
    return (
      <span className={`${base} bg-accent-subtle text-accent-primary`} aria-hidden="true">
        <ImageIcon size={icon} />
      </span>
    );
  }
  const badge = EXT_BADGES[ext];
  if (badge) {
    return (
      <span className={`${base} ${badge.className}`} aria-hidden="true">
        {badge.label}
      </span>
    );
  }
  return (
    <span className={`${base} bg-layer-3 text-secondary`} aria-hidden="true">
      <FileText size={icon} />
    </span>
  );
};

/** 待提交附件卡片：提交区和附件页签「待提交」块共用 */
export const PendingFileChip: React.FC<{
  file: File;
  onRemove: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ file, onRemove, disabled, className }) => (
  <div
    title={`${file.name}（${formatFileSize(file.size)}）`}
    className={cn(
      "flex h-[46px] max-w-[250px] items-center gap-2 rounded-lg border border-subtle bg-layer-1 pr-1.5 pl-[7px]",
      className
    )}
  >
    <FileTypeBadge name={file.name} />
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-13 leading-[18px] text-primary">{file.name}</span>
      <span className="text-11 leading-[15px] text-placeholder">{formatFileSize(file.size)}</span>
    </div>
    <button
      type="button"
      aria-label="移除附件"
      disabled={disabled}
      onClick={onRemove}
      className="flex size-[22px] shrink-0 items-center justify-center rounded text-placeholder transition-colors hover:bg-layer-2 hover:text-danger-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <X size={14} />
    </button>
  </div>
);

/** 执行结果枚举的颜色名（green/red/gold/gray）→ 圆点与选中态样式 */
const RESULT_TONES: Record<string, { dot: string; selected: string }> = {
  green: { dot: "bg-success-primary", selected: "border-success-strong bg-success-subtle text-success-primary" },
  red: { dot: "bg-danger-primary", selected: "border-danger-strong bg-danger-subtle text-danger-primary" },
  gold: { dot: "bg-warning-primary", selected: "border-warning-strong bg-warning-subtle text-warning-primary" },
};
const NEUTRAL_TONE = { dot: "bg-[var(--txt-placeholder)]", selected: "border-strong bg-layer-2 text-primary" };

export const getResultTone = (color: string | undefined) => RESULT_TONES[String(color ?? "")] ?? NEUTRAL_TONE;
