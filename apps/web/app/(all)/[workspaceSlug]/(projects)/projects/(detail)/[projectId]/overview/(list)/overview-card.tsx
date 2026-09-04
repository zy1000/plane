import { type FC, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@plane/utils";

type Props = {
  title: string;
  icon: LucideIcon;
  iconClassName?: string;
  /** 标题右侧的轻量说明（如「共 4 人」） */
  meta?: ReactNode;
  /** 标题行最右侧的操作区（如全屏、新增按钮） */
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

/** 卡片标题行右侧的小图标按钮（全屏 / 新增） */
export const overviewIconButtonClass =
  "cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-placeholder";

/**
 * 概览页统一卡片外壳：分层表面，各模块观感一致。
 */
export const OverviewCard: FC<Props> = ({
  title,
  icon: Icon,
  iconClassName,
  meta,
  action,
  className,
  bodyClassName,
  children,
}) => (
  <div
    className={cn(
      "group flex flex-col overflow-hidden rounded-xl border border-subtle bg-surface-1",
      className
    )}
  >
    <div className="flex flex-shrink-0 items-center justify-between gap-2 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={cn("h-4 w-4 flex-shrink-0 text-placeholder", iconClassName)} />
        <span className="truncate text-sm font-semibold text-primary">{title}</span>
        {meta != null &&
          (typeof meta === "string" ? (
            <span className="flex-shrink-0 text-xs text-placeholder">{meta}</span>
          ) : (
            <div className="flex-shrink-0">{meta}</div>
          ))}
      </div>
      {action != null && <div className="flex flex-shrink-0 items-center gap-1">{action}</div>}
    </div>
    <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
  </div>
);
