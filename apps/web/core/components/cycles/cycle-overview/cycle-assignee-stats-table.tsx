"use client";

import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import userImage from "@/app/assets/user.png?url";
import type { TCycleAssigneeStatRow } from "./use-cycle-assignee-stats";

type Props = {
  rows: TCycleAssigneeStatRow[];
  selectedAssigneeIds: string[];
  onAssigneeClick: (assigneeId: string | undefined) => void;
  isEditable?: boolean;
};

export const CycleAssigneeStatsTable = ({ rows, selectedAssigneeIds, onAssigneeClick, isEditable }: Props) => {
  if (rows.length === 0) {
    return <div className="grid h-full place-items-center text-sm text-placeholder">暂无成员数据</div>;
  }

  return (
    <table className="w-full min-w-[640px] table-fixed">
      <thead>
        <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
          <th className="w-[34%] px-2 py-2 text-sm font-medium text-primary">成员</th>
          <th className="w-[14%] px-2 py-2 text-center text-sm font-medium text-primary">已完成</th>
          <th className="w-[14%] px-2 py-2 text-center text-sm font-medium text-primary">未完成</th>
          <th className="w-[14%] px-2 py-2 text-center text-sm font-medium text-primary">已延期</th>
          <th className="w-[24%] px-2 py-2 text-right text-sm font-medium text-primary">完成率</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isSelected = row.id ? selectedAssigneeIds.includes(row.id) : false;
          const isClickable = Boolean(isEditable && row.id);

          return (
            <tr
              key={row.id ?? "unassigned"}
              className={cn(
                "border-b border-subtle",
                isClickable && "cursor-pointer hover:bg-layer-1",
                isSelected && "bg-layer-1"
              )}
              onClick={isClickable ? () => onAssigneeClick(row.id) : undefined}
            >
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  {row.id ? (
                    <Avatar size="sm" name={row.title} src={row.avatar_url ? getFileURL(row.avatar_url) : ""} />
                  ) : (
                    <div className="h-6 w-6 rounded-full border border-subtle bg-layer-1 p-0.5">
                      <img src={userImage} className="h-full w-full rounded-full object-cover" alt="无负责人" />
                    </div>
                  )}
                  <span className="truncate text-sm text-primary" title={row.title}>
                    {row.title}
                  </span>
                </div>
              </td>
              <td className="px-2 py-2 text-center text-sm tabular-nums text-primary">{row.completed}</td>
              <td className="px-2 py-2 text-center text-sm tabular-nums text-primary">{row.pending}</td>
              <td
                className={cn(
                  "px-2 py-2 text-center text-sm tabular-nums",
                  row.overdue > 0 ? "text-danger-primary" : "text-primary"
                )}
              >
                {row.overdue}
              </td>
              <td className="px-2 py-2 text-right">
                <div className="inline-flex items-baseline gap-1 tabular-nums">
                  <span className="text-sm text-primary">{row.completionRate}%</span>
                  <span className="text-xs text-placeholder">of {row.total}</span>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
