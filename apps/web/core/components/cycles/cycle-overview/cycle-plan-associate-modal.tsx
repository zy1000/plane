"use client";

import type { Dispatch, SetStateAction } from "react";
import { Modal } from "antd";
import { formatPlanDate, getPlanStatusClassName } from "@/components/cycles/cycle-overview/cycle-test-plans-table";

type TCyclePlanAssociateModalProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  selectedPlanIds: string[];
  setSelectedPlanIds: Dispatch<SetStateAction<string[]>>;
  selectablePlans: any[];
  selectablePlansLoading: boolean;
  selectablePlansError: string | null;
  associatingPlans: boolean;
  canManageCyclePlans?: boolean;
};

export const CyclePlanAssociateModal = ({
  open,
  onCancel,
  onConfirm,
  selectedPlanIds,
  setSelectedPlanIds,
  selectablePlans,
  selectablePlansLoading,
  selectablePlansError,
  associatingPlans,
  canManageCyclePlans = true,
}: TCyclePlanAssociateModalProps) => (
  <Modal
    title="关联测试计划"
    open={open}
    onCancel={onCancel}
    onOk={onConfirm}
    okText="确定"
    cancelText="取消"
    okButtonProps={{
      disabled: selectedPlanIds.length === 0 || selectablePlansLoading || !canManageCyclePlans,
      loading: associatingPlans,
    }}
    width={720}
    destroyOnHidden
  >
    <div className="mt-2">
      {selectablePlansLoading ? (
        <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
      ) : selectablePlansError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{selectablePlansError}</div>
      ) : (
        <div className="max-h-[min(480px,60vh)] overflow-y-auto overflow-x-auto vertical-scrollbar scrollbar-sm">
          <table className="min-w-full table-fixed">
            <thead>
              <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                <th className="w-10 px-2 py-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selectablePlans.length > 0 && selectedPlanIds.length === selectablePlans.length}
                    disabled={!canManageCyclePlans}
                    onChange={(e) => {
                      if (!canManageCyclePlans) return;
                      if (e.target.checked) setSelectedPlanIds(selectablePlans.map((p: any) => p.id));
                      else setSelectedPlanIds([]);
                    }}
                  />
                </th>
                <th className="w-2/5 px-2 py-2 text-sm font-medium text-primary">测试计划</th>
                <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">状态</th>
                <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">开始时间</th>
                <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">结束时间</th>
              </tr>
            </thead>
            <tbody>
              {selectablePlans.length === 0 ? (
                <tr>
                  <td className="px-2 py-6 text-sm text-secondary" colSpan={5}>
                    暂无可选测试计划
                  </td>
                </tr>
              ) : (
                selectablePlans.map((plan: any) => {
                  const checked = selectedPlanIds.includes(plan.id);
                  return (
                    <tr key={plan.id} className="border-b border-subtle hover:bg-layer-1-hover">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={checked}
                          disabled={!canManageCyclePlans}
                          onChange={(e) => {
                            if (!canManageCyclePlans) return;
                            const v = e.target.checked;
                            setSelectedPlanIds((prev) => {
                              if (v) return Array.from(new Set([...prev, plan.id]));
                              return prev.filter((x) => x !== plan.id);
                            });
                          }}
                        />
                      </td>
                      <td className="truncate px-2 py-2 text-sm text-primary" title={plan.name ?? "-"}>
                        {plan.name ?? "-"}
                      </td>
                      <td className={`px-2 py-2 text-sm ${getPlanStatusClassName(plan.state)}`}>{plan.state ?? "-"}</td>
                      <td className="px-2 py-2 text-sm text-primary">{formatPlanDate(plan.start_date ?? plan.start_at ?? null)}</td>
                      <td className="px-2 py-2 text-sm text-primary">{formatPlanDate(plan.end_date ?? plan.end_at ?? null)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </Modal>
);
