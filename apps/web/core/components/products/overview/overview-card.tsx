import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@plane/utils";

type TProps = {
  title: string;
  /** 标题旁的计数；null / undefined 不显示 */
  count?: number | null;
  /** 标题行右侧（说明文字、「全部 xx」链接） */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** 产品概览各卡片的外壳：标题行 + 分隔线 + 内容 */
export function ProductOverviewCard({ title, count, action, className, children }: TProps) {
  return (
    <section
      aria-label={title}
      className={cn("min-w-0 overflow-hidden rounded-lg border border-subtle bg-surface-1", className)}
    >
      <div className="flex min-h-12 items-center gap-2 border-b border-subtle px-4">
        <h2 className="text-14 font-semibold text-primary">{title}</h2>
        {count != null && <span className="text-13 font-medium text-tertiary tabular-nums">{count}</span>}
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

/** 标题行右侧的「全部 xx」文字链接 */
export function ProductOverviewCardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="shrink-0 text-12 font-medium whitespace-nowrap text-accent-primary hover:underline">
      {children}
    </Link>
  );
}

/** 卡片里的空态 / 无权限占位 */
export function ProductOverviewCardEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-32 flex-col items-center justify-center gap-3 px-6 py-6 text-13 text-secondary",
        className
      )}
    >
      {children}
    </div>
  );
}
