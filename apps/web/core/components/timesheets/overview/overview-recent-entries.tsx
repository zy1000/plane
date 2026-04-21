import { FileText } from "lucide-react";
import { Card } from "@plane/ui";
import type { TTimeSheet } from "@/services/issue/timesheet.service";

type Props = {
  entries: TTimeSheet[];
  title?: string;
};

function formatTimeRange(start: string, end: string) {
  return `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
}

function getEntryLabel(entry: TTimeSheet): string {
  if (entry.issue_detail) return `#${entry.issue_detail.sequence_id} ${entry.issue_detail.name}`;
  if (entry.test_case_detail) return entry.test_case_detail.name;
  return entry.category_detail?.name ?? "项目工时";
}

export function OverviewRecentEntries({ entries, title = "最近填报（本月）" }: Props) {
  return (
    <Card className="flex flex-col border border-subtle p-4">
      <div className="mb-4 flex flex-shrink-0 items-center gap-2">
        <FileText className="h-4 w-4 text-placeholder" />
        <span className="text-sm font-medium text-primary">{title}</span>
      </div>
      {entries.length > 0 ? (
        <div className="space-y-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-layer-1"
            >
              <div className="min-w-[72px] flex-shrink-0 whitespace-nowrap text-placeholder">
                {entry.date}
              </div>
              <div className="min-w-0 flex-1 truncate text-primary" title={getEntryLabel(entry)}>
                {getEntryLabel(entry)}
              </div>
              <div className="flex-shrink-0 text-placeholder">{formatTimeRange(entry.start_time, entry.end_time)}</div>
              <div className="w-[48px] flex-shrink-0 text-right font-medium text-primary">
                {parseFloat(entry.hours)}h
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-[200px] items-center justify-center text-sm text-placeholder">
          暂无工时记录
        </div>
      )}
    </Card>
  );
}
