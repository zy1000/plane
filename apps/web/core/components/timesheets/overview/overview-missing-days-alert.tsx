import { AlertTriangle, ArrowRight } from "lucide-react";
import { Card } from "@plane/ui";
import { useAppRouter } from "@/hooks/use-app-router";
import type { TAlertDay } from "@/hooks/store/use-timesheet-overview";

type Props = {
  alertDays: TAlertDay[];
  workspaceSlug: string;
};

const WEEKDAY_MAP: Record<string, string> = {};
function getWeekdayLabel(dateStr: string): string {
  if (WEEKDAY_MAP[dateStr]) return WEEKDAY_MAP[dateStr];
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const label = labels[day] ?? "";
  WEEKDAY_MAP[dateStr] = label;
  return label;
}

export function OverviewMissingDaysAlert({ alertDays, workspaceSlug }: Props) {
  const router = useAppRouter();

  const handleGoToFill = () => {
    router.push(`/${workspaceSlug}/timesheets/manage`);
  };

  const missingCount = alertDays.filter((d) => d.type === "missing").length;
  const insufficientCount = alertDays.filter((d) => d.type === "insufficient").length;

  return (
    <Card className="border border-subtle p-4">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium text-primary">填报提醒</span>
      </div>
      {alertDays.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-placeholder">
            {missingCount > 0 && <span>{missingCount} 天未填报</span>}
            {insufficientCount > 0 && <span>{insufficientCount} 天不足 8h</span>}
          </div>
          <div className="max-h-[200px] space-y-1.5 overflow-y-auto vertical-scrollbar scrollbar-sm">
            {alertDays.map((item) => (
              <div
                key={item.date}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-xs ${
                  item.type === "missing" ? "bg-amber-500/5" : "bg-orange-500/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`h-1.5 w-1.5 rounded-full ${item.type === "missing" ? "bg-amber-500" : "bg-orange-500"}`}
                  />
                  <span className="text-primary">
                    {item.date} ({getWeekdayLabel(item.date)})
                  </span>
                </div>
                {item.type === "missing" ? (
                  <span className="text-amber-600">未填报</span>
                ) : (
                  <span className="text-orange-600">{item.hours}h / 8h</span>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleGoToFill}
            className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-accent-primary/10 px-3 py-2 text-xs font-medium text-accent-primary transition-colors hover:bg-accent-primary/20"
          >
            去填报工时
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
            <svg className="h-5 w-5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="text-sm font-medium text-primary">工时已全部达标</div>
          <div className="text-xs text-placeholder">每天均已填满 8 小时</div>
        </div>
      )}
    </Card>
  );
}
