"use client";

import { Popconfirm } from "antd";
import { Unlink } from "lucide-react";
import { Button } from "@plane/ui";
import { getDate } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";

export const formatPlanDate = (value?: string | null) => {
  if (!value) return "-";
  const date = getDate(value);
  if (!date) return "-";
  return date.toLocaleDateString("zh-CN");
};

export const getPassRate = (passRate: any) => {
  if (typeof passRate === "number") return `${passRate}%`;
  if (!passRate || typeof passRate !== "object") return "0%";
  const total = Object.values(passRate).reduce((sum, count) => sum + Number(count || 0), 0);
  const passed = Number(passRate?.["成功"] || passRate?.success || 0);
  const percent = total > 0 ? Math.floor((passed / total) * 100) : 0;
  return `${percent}%`;
};

export const getBlockRate = (passRate: any) => {
  if (!passRate || typeof passRate !== "object") return "0%";
  const total = Object.values(passRate).reduce((sum, count) => sum + Number(count || 0), 0);
  const blocked = Number(passRate?.["阻塞"] || passRate?.block || 0);
  const percent = total > 0 ? Math.floor((blocked / total) * 100) : 0;
  return `${percent}%`;
};

export const getPlanAssigneeIds = (assignees: any): string[] => {
  if (!Array.isArray(assignees)) return [];
  return assignees
    .map((assignee) => {
      if (typeof assignee === "string") return assignee;
      return assignee?.id;
    })
    .filter(Boolean);
};

export const getPlanStatusClassName = (state?: string) => {
  if (state === "进行中") return "text-[#F59E0B]";
  if (state === "已完成") return "text-success-primary";
  if (state === "未开始") return "text-secondary";
  return "text-placeholder";
};

type TCycleTestPlansTableProps = {
  cyclePlans: any[];
  projectId: string;
  cancelingPlanId: string | null;
  onOpenPlan: (planId: string) => void;
  onCancelPlanAssociation: (planId: string) => void;
};

export const CycleTestPlansTable = ({
  cyclePlans,
  projectId,
  cancelingPlanId,
  onOpenPlan,
  onCancelPlanAssociation,
}: TCycleTestPlansTableProps) => (
  <table className="min-w-full table-fixed">
    <thead>
      <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
        <th className="w-[26%] px-2 py-2 text-sm font-medium text-primary">测试计划</th>
        <th className="w-[11%] px-2 py-2 text-sm font-medium text-primary">状态</th>
        <th className="w-[11%] px-2 py-2 text-sm font-medium text-primary">通过率</th>
        <th className="w-[11%] px-2 py-2 text-sm font-medium text-primary">阻塞率</th>
        <th className="w-[11%] px-2 py-2 text-sm font-medium text-primary">开始时间</th>
        <th className="w-[11%] px-2 py-2 text-sm font-medium text-primary">结束时间</th>
        <th className="w-[19%] px-2 py-2 text-left text-sm font-medium text-primary">负责人</th>
      </tr>
    </thead>
    <tbody>
      {cyclePlans.map((plan: any) => {
        const assigneeIds = getPlanAssigneeIds(plan.assignees);
        return (
          <tr key={plan.id ?? plan.name} className="group border-b border-subtle hover:bg-layer-1">
            <td className="px-2 py-2 text-sm text-primary">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1 truncate" title={plan.name ?? "-"}>
                  {plan.id ? (
                    <button
                      type="button"
                      className="max-w-full truncate text-left text-sm text-primary hover:underline"
                      onClick={() => onOpenPlan(plan.id)}
                    >
                      {plan.name ?? "-"}
                    </button>
                  ) : (
                    plan.name ?? "-"
                  )}
                </div>
                {plan.id ? (
                  <Popconfirm
                    title="确定取消该测试计划的关联吗？"
                    okText="取消关联"
                    cancelText="取消"
                    onConfirm={() => {
                      if (plan.id) onCancelPlanAssociation(plan.id);
                    }}
                  >
                    <Button
                      variant="link-neutral"
                      className={`shrink-0 p-0 transition-opacity ${
                        cancelingPlanId === plan.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                      loading={cancelingPlanId === plan.id}
                      disabled={cancelingPlanId === plan.id}
                      aria-label="取消关联"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </Popconfirm>
                ) : null}
              </div>
            </td>
            <td className={`px-2 py-2 text-sm ${getPlanStatusClassName(plan.state)}`}>{plan.state ?? "-"}</td>
            <td className="px-2 py-2 text-sm text-primary">{getPassRate(plan.pass_rate)}</td>
            <td className="px-2 py-2 text-sm text-primary">{getBlockRate(plan.pass_rate)}</td>
            <td className="px-2 py-2 text-sm text-primary">{formatPlanDate(plan.start_date ?? plan.start_at ?? null)}</td>
            <td className="px-2 py-2 text-sm text-primary">{formatPlanDate(plan.end_date ?? plan.end_at ?? null)}</td>
            <td className="px-2 py-2 text-left">
              {assigneeIds.length > 0 ? (
                <MemberDropdown
                  multiple={true}
                  value={assigneeIds}
                  onChange={() => {}}
                  disabled={true}
                  projectId={projectId}
                  placeholder=""
                  className="w-full text-sm"
                  buttonContainerClassName="w-full cursor-default p-0 text-left"
                  buttonVariant="transparent-with-text"
                  buttonClassName="p-0 text-sm hover:bg-inherit hover:bg-transparent"
                  showUserDetails={true}
                  optionsClassName="z-[60]"
                />
              ) : (
                <span className="text-sm text-placeholder">-</span>
              )}
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);
