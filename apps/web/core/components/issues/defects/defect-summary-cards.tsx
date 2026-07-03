import type { FC, ReactNode } from "react";
import { AlertTriangle, Bug, CalendarX2, Clock, Hourglass } from "lucide-react";
import { cn } from "@plane/utils";
import { useCountUp } from "@/hooks/use-count-up";

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
  stalePendingDefects: number;
  overdueDefects: number;
  dueSoonDefects: number;
};

const toneClassNames: Record<TTone, string> = {
  danger: "text-danger-primary",
  neutral: "text-secondary",
  success: "text-green-600",
  warning: "text-amber-600",
};

const DefectSummaryCard: FC<{ isLoading: boolean; item: TSummaryItem }> = ({ isLoading, item }) => {
  const displayValue = useCountUp(item.value, { enabled: !isLoading });

  return (
    <div className="relative overflow-hidden rounded-xl border border-subtle bg-surface-1 p-4 shadow-sm">
      <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-red-500/[0.04]" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-secondary">{item.label}</div>
          <div className="mt-2 flex items-baseline gap-1 tabular-nums">
            {isLoading ? (
              <span className="h-8 w-12 animate-pulse rounded bg-surface-2" />
            ) : (
              <>
                <span className="text-2xl font-semibold tracking-tight text-primary">{displayValue}</span>
                {item.suffix ? <span className="text-sm text-placeholder">{item.suffix}</span> : null}
              </>
            )}
          </div>
          <div className="mt-2 line-clamp-1 text-xs text-placeholder">{item.description}</div>
        </div>
        <div className={cn("flex-shrink-0", toneClassNames[item.tone])}>{item.icon}</div>
      </div>
    </div>
  );
};

export const DefectSummaryCards: FC<Props> = ({
  isLoading,
  totalDefects,
  pendingDefects,
  stalePendingDefects,
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
      description: "未完成、未取消且非 Suspend 的缺陷",
      icon: <AlertTriangle className="h-4 w-4" />,
      tone: pendingDefects > 0 ? "danger" : "success",
    },
    {
      key: "stale_pending",
      label: "超过 7 天未处理",
      value: stalePendingDefects,
      description: "创建超过 7 天且未完成/未取消/非 Suspend 的缺陷",
      icon: <Hourglass className="h-4 w-4" />,
      tone: stalePendingDefects > 0 ? "warning" : "neutral",
    },
    {
      key: "overdue",
      label: "逾期",
      value: overdueDefects,
      description: "已过截止日期、未完成且非 Suspend",
      icon: <CalendarX2 className="h-4 w-4" />,
      tone: overdueDefects > 0 ? "danger" : "neutral",
    },
    {
      key: "due_soon",
      label: "临期",
      value: dueSoonDefects,
      description: "未来 7 天内到期、未完成且非 Suspend",
      icon: <Clock className="h-4 w-4" />,
      tone: dueSoonDefects > 0 ? "warning" : "neutral",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <DefectSummaryCard key={item.key} isLoading={isLoading} item={item} />
      ))}
    </div>
  );
};
