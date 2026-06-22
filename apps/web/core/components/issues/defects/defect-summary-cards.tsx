import type { FC, ReactNode } from "react";
import { AlertTriangle, Bug, CalendarX2, CheckCircle2, Clock, Ratio } from "lucide-react";
import { cn } from "@plane/utils";

type TTone = "neutral" | "danger" | "success" | "warning";

type TSummaryItem = {
  key: string;
  label: string;
  value: number;
  description: string;
  icon: ReactNode;
  tone: TTone;
  suffix?: string;
};

type Props = {
  isLoading: boolean;
  totalDefects: number;
  pendingDefects: number;
  resolvedDefects: number;
  pendingRatio: number;
  overdueDefects: number;
  dueSoonDefects: number;
};

const toneClassNames: Record<TTone, string> = {
  danger: "bg-red-500/10 text-danger-primary ring-red-500/15",
  neutral: "bg-surface-2 text-primary ring-subtle",
  success: "bg-green-500/10 text-green-600 ring-green-500/15",
  warning: "bg-amber-500/10 text-amber-600 ring-amber-500/15",
};

export const DefectSummaryCards: FC<Props> = ({
  isLoading,
  totalDefects,
  pendingDefects,
  resolvedDefects,
  pendingRatio,
  overdueDefects,
  dueSoonDefects,
}) => {
  const items: TSummaryItem[] = [
    {
      key: "total",
      label: "全部缺陷",
      value: totalDefects,
      description: "项目内已归类为缺陷的工作项",
      icon: <Bug className="h-4 w-4" />,
      tone: "neutral",
    },
    {
      key: "pending",
      label: "待处理",
      value: pendingDefects,
      description: "未完成且未取消的缺陷",
      icon: <AlertTriangle className="h-4 w-4" />,
      tone: pendingDefects > 0 ? "danger" : "success",
    },
    {
      key: "resolved",
      label: "已关闭/已解决",
      value: resolvedDefects,
      description: "已完成或已取消的缺陷",
      icon: <CheckCircle2 className="h-4 w-4" />,
      tone: "success",
    },
    {
      key: "ratio",
      label: "待处理占比",
      value: pendingRatio,
      suffix: "%",
      description: "待处理缺陷在全部缺陷中的占比",
      icon: <Ratio className="h-4 w-4" />,
      tone: pendingRatio >= 50 ? "warning" : "neutral",
    },
    {
      key: "overdue",
      label: "逾期",
      value: overdueDefects,
      description: "已过截止日期且未完成",
      icon: <CalendarX2 className="h-4 w-4" />,
      tone: overdueDefects > 0 ? "danger" : "neutral",
    },
    {
      key: "due_soon",
      label: "临期",
      value: dueSoonDefects,
      description: "未来 7 天内到期且未完成",
      icon: <Clock className="h-4 w-4" />,
      tone: dueSoonDefects > 0 ? "warning" : "neutral",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.key}
          className="relative overflow-hidden rounded-xl border border-subtle bg-surface-1 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-strong hover:shadow-md"
        >
          <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-red-500/[0.04]" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-secondary">{item.label}</div>
              <div className="mt-2 flex items-baseline gap-1 tabular-nums">
                {isLoading ? (
                  <span className="h-8 w-12 animate-pulse rounded bg-surface-2" />
                ) : (
                  <>
                    <span className="text-2xl font-semibold tracking-tight text-primary">{item.value}</span>
                    {item.suffix ? <span className="text-sm text-placeholder">{item.suffix}</span> : null}
                  </>
                )}
              </div>
              <div className="mt-2 line-clamp-1 text-xs text-placeholder">{item.description}</div>
            </div>
            <div className={cn("rounded-lg p-2 ring-1", toneClassNames[item.tone])}>{item.icon}</div>
          </div>
        </div>
      ))}
    </div>
  );
};
