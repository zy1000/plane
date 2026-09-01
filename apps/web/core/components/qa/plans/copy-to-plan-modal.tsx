"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ClipboardList, Copy, Info, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CustomSearchSelect, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PlanService, type TPlanListItem } from "@/services/qa/plan.service";
import { qaCaseSetToastError, qaCaseSetToastSuccess, qaCaseSetToastWarning } from "@/utils/qa-case-error";

type TAssigneeMode = "keep" | "override";

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  sourcePlanId: string;
  sourcePlanName?: string;
  planOptions: TPlanListItem[];
  selectedPlanCaseIds: string[];
  onSuccess?: () => void;
};

const ASSIGNEE_MODE_OPTIONS: Array<{ value: TAssigneeMode; title: string; description: string }> = [
  { value: "keep", title: "沿用原执行人", description: "每条用例保留在当前计划中的执行人" },
  { value: "override", title: "统一指定", description: "所有用例指派给同一批执行人" },
];

// 与 TestPlan.State（未开始/进行中/已完成）对应的标签配色
const PLAN_STATE_TAG_CLASS: Record<string, string> = {
  未开始: "bg-layer-1 text-tertiary",
  进行中: "bg-accent-subtle text-accent-primary",
  已完成: "bg-success-subtle text-success-primary",
};

// DateField 返回 "YYYY-MM-DD"，下拉里只展示 MM-DD
const toMonthDay = (value?: string | null) => (value ? String(value).slice(5, 10) : "");

const formatPlanDateRange = (plan: TPlanListItem) => {
  const begin = toMonthDay(plan.begin_time);
  const end = toMonthDay(plan.end_time);
  if (begin && end) return `${begin} ~ ${end}`;
  return begin || end;
};

export default function PlanCasesCopyModal({
  open,
  onClose,
  workspaceSlug,
  projectId,
  sourcePlanId,
  sourcePlanName,
  planOptions,
  selectedPlanCaseIds,
  onSuccess,
}: Props) {
  const { t } = useTranslation();
  const planService = useRef(new PlanService()).current;
  // 弹窗打开时聚焦到表单区，避免 Headless UI 默认聚焦到关闭按钮
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [targetPlanId, setTargetPlanId] = useState<string | null>(null);
  const [assigneeMode, setAssigneeMode] = useState<TAssigneeMode>("keep");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ target?: string; assignee?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetPlanId(null);
      setAssigneeMode("keep");
      setAssignees([]);
      setErrors({});
    }
  }, [open]);

  const selectedCount = selectedPlanCaseIds.length;
  const targetPlan = useMemo(
    () => planOptions.find((p) => String(p.id) === targetPlanId) ?? null,
    [planOptions, targetPlanId]
  );

  const targetOptions = useMemo(
    () =>
      planOptions.map((plan) => {
        const range = formatPlanDateRange(plan);
        const state = plan.state ? String(plan.state) : "";
        return {
          value: String(plan.id),
          query: String(plan.name ?? ""),
          content: (
            <span className="flex w-full items-center gap-2.5">
              <span className="flex-1 truncate text-sm text-primary">{plan.name}</span>
              {range && <span className="shrink-0 text-xs text-placeholder tabular-nums">{range}</span>}
              {state && (
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none",
                    PLAN_STATE_TAG_CLASS[state] ?? "bg-layer-1 text-tertiary"
                  )}
                >
                  {state}
                </span>
              )}
            </span>
          ),
        };
      }),
    [planOptions]
  );

  const handleConfirm = async () => {
    if (!workspaceSlug || !projectId || !sourcePlanId) {
      qaCaseSetToastWarning("缺少必要参数");
      return;
    }
    const planCaseIds = Array.from(new Set(selectedPlanCaseIds.map(String)));
    if (planCaseIds.length === 0) {
      qaCaseSetToastWarning("请先选择用例");
      return;
    }
    const nextErrors: { target?: string; assignee?: string } = {};
    if (!targetPlanId) nextErrors.target = "请选择目标计划";
    if (assigneeMode === "override" && assignees.length === 0) nextErrors.assignee = "请选择执行人";
    setErrors(nextErrors);
    if (nextErrors.target || nextErrors.assignee) return;

    const targetName = targetPlan?.name ?? "";
    try {
      setSubmitting(true);
      const res = await planService.copyPlanCases(workspaceSlug, projectId, {
        source_plan_id: sourcePlanId,
        target_plan_id: String(targetPlanId),
        plan_case_ids: planCaseIds,
        assignees: assigneeMode === "override" ? assignees : null,
      });
      const copied = Number(res?.copied ?? 0);
      const skipped = Number(res?.skipped ?? 0);
      if (copied === 0) {
        qaCaseSetToastWarning(`所选用例在「${targetName}」中均已存在，未复制`);
      } else {
        // 第二个参数是标题：主文案作标题，说明作正文
        qaCaseSetToastSuccess(
          skipped > 0 ? `${skipped} 条在目标计划中已存在，已跳过` : "执行结果已重置为未执行",
          `已复制 ${copied} 条用例到「${targetName}」`
        );
      }
      onSuccess?.();
      onClose();
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "复制失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={open}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XL}
      initialFocus={bodyRef}
    >
      <div className="flex w-full flex-col text-primary">
        {/* Header */}
        <div className="flex items-start gap-3.5 px-6 pt-5 pb-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-accent-subtle bg-accent-subtle text-accent-primary">
            <Copy className="size-[18px]" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-base font-semibold leading-tight text-primary">复制到计划</h3>
            <p className="mt-1 text-[13px] leading-snug text-tertiary">
              从 <span className="font-medium text-secondary">{sourcePlanName || "当前计划"}</span> 复制{" "}
              <span className="font-medium text-secondary tabular-nums">{selectedCount}</span> 条用例到另一个测试计划
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="-mt-0.5 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-layer-1 hover:text-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div ref={bodyRef} tabIndex={-1} className="flex flex-col gap-5 border-t border-subtle px-6 pt-5 pb-1 outline-none">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-secondary">
              目标计划<span className="ml-0.5 text-danger-primary">*</span>
            </label>
            <CustomSearchSelect
              className="w-full"
              value={targetPlanId}
              onChange={(value: string | null) => {
                setTargetPlanId(value ? String(value) : null);
                setErrors((prev) => ({ ...prev, target: undefined }));
              }}
              options={targetOptions}
              noResultsMessage="没有匹配的计划"
              maxHeight="lg"
              optionsClassName="min-w-[420px] py-2"
              customButtonClassName="w-full rounded-lg hover:bg-transparent focus:bg-transparent active:bg-transparent"
              customButton={
                <div
                  className={cn(
                    "flex h-10 w-full items-center gap-2.5 rounded-lg border bg-surface-1 px-3 text-sm transition-colors",
                    errors.target ? "border-danger-strong" : "border-subtle-1 hover:border-strong"
                  )}
                >
                  <ClipboardList className="size-4 shrink-0 text-tertiary" />
                  <span className={cn("flex-1 truncate text-left", targetPlan ? "text-primary" : "text-placeholder")}>
                    {targetPlan?.name ?? "搜索或选择测试计划"}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-tertiary" />
                </div>
              }
            />
            {errors.target && <span className="text-xs text-danger-primary">{errors.target}</span>}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-secondary">执行人</label>
            <div role="radiogroup" className="grid grid-cols-2 gap-2.5">
              {ASSIGNEE_MODE_OPTIONS.map((option) => {
                const checked = assigneeMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => {
                      setAssigneeMode(option.value);
                      setErrors((prev) => ({ ...prev, assignee: undefined }));
                    }}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-left transition-colors",
                      checked
                        ? "border-accent-strong bg-accent-subtle ring-1 ring-accent-strong"
                        : "border-subtle-1 bg-surface-1 hover:bg-layer-1"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px]",
                        checked ? "border-accent-primary bg-accent-primary" : "border-strong"
                      )}
                    >
                      {checked && <span className="size-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-tight text-primary">{option.title}</span>
                      <span className="mt-1 block text-xs leading-snug text-tertiary">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {assigneeMode === "override" && (
              <div className="flex flex-col gap-1.5">
                <MemberDropdown
                  multiple
                  projectId={projectId || undefined}
                  value={assignees}
                  onChange={(value) => {
                    setAssignees(value);
                    setErrors((prev) => ({ ...prev, assignee: undefined }));
                  }}
                  placeholder="选择执行人"
                  buttonVariant="border-with-text"
                  buttonContainerClassName="w-full"
                  buttonClassName={cn(
                    "h-10 w-full rounded-lg px-3 text-sm",
                    errors.assignee ? "border-danger-strong" : "border-subtle-1"
                  )}
                  showUserDetails
                />
                {errors.assignee && <span className="text-xs text-danger-primary">{errors.assignee}</span>}
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-subtle bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-secondary">
            <Info className="mt-0.5 size-3.5 shrink-0 text-tertiary" />
            <span>复制后的用例执行结果为「未执行」，不带执行记录与缺陷关联；目标计划中已存在的用例会自动跳过。</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 pt-4 pb-5">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button variant="primary" loading={submitting} onClick={handleConfirm} prependIcon={<Copy />}>
            复制用例
            <span className="ml-0.5 rounded bg-white/20 px-1.5 py-px text-xs font-semibold tabular-nums">{selectedCount}</span>
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
