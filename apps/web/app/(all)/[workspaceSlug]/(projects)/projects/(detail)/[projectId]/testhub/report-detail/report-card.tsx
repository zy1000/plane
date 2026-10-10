import type { ReactNode } from "react";
import { cn } from "@plane/utils";

/** 详情页四张卡片共用的壳 */
export const ReportCard = ({ children, className }: { children: ReactNode; className?: string }) => (
  <section className={cn("min-w-0 rounded-[10px] border border-subtle bg-surface-1 shadow-sm", className)}>
    {children}
  </section>
);

export const ReportCardHeader = ({
  title,
  count,
  right,
}: {
  title: string;
  count?: number;
  right?: ReactNode;
}) => (
  <div className="flex items-center gap-2.5 px-5 pt-3.5">
    <h4 className="text-sm font-semibold text-primary">{title}</h4>
    {count !== undefined && (
      <span className="rounded-full bg-layer-1 px-2 py-px text-12 font-medium text-tertiary tabular-nums">{count}</span>
    )}
    <div className="flex-1" />
    {typeof right === "string" ? <span className="text-12 text-tertiary">{right}</span> : right}
  </div>
);
