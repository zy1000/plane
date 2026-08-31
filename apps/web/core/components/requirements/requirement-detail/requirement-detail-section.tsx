/**
 * 抽屉正文各区块共用的标题行：图标 + 标题 + 计数/说明，右侧放该区块自己的操作。
 *
 * 字段区、关联区、历史区此前各自画标题，粗细、行高、下划线三样三个样。收成一个组件后
 * 抽屉从上到下只有一种「区块开始了」的信号。
 */
import type { ReactNode } from "react";
import type { ComponentType } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@plane/utils";

/** 区块标题行右侧的文字按钮：透明底，hover 才浮出，避免和正文里的主按钮抢眼 */
export const SECTION_ACTION_BUTTON =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-body-xs-medium text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-secondary";

export const DetailSectionHeader = ({
  icon: Icon,
  title,
  meta,
  actions,
  className,
  onToggle,
  isOpen,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  /** 标题右侧的次要信息：计数、来源说明 */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** 传了就把标题渲染成可折叠按钮（chevron 在最前） */
  onToggle?: () => void;
  isOpen?: boolean;
}) => {
  const heading = (
    <>
      {Icon && <Icon className="size-4 shrink-0 text-tertiary" />}
      <span className="truncate text-body-sm-semibold text-primary">{title}</span>
      {meta && <span className="min-w-0 truncate text-caption-md-regular text-tertiary">{meta}</span>}
    </>
  );
  return (
    <div className={cn("flex h-9 items-center gap-2 border-b border-subtle", className)}>
      {onToggle ? (
        <button type="button" onClick={onToggle} className="flex min-w-0 items-center gap-2 text-left">
          <ChevronRight
            className={cn("size-3.5 shrink-0 text-tertiary transition-transform duration-200", isOpen && "rotate-90")}
          />
          {heading}
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-2">{heading}</div>
      )}
      <span className="flex-1" />
      {actions && (
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
};
