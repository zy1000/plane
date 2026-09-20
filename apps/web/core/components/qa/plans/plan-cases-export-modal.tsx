"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { PlanService } from "@/services/qa/plan.service";
import { qaCaseSetToastErrorFromAxios, qaCaseSetToastWarning } from "@/utils/qa-case-error";

type TExportScope = "filtered" | "selected" | "plan";

type TExportFieldGroup = {
  label: string;
  fields: { key: string; label: string }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  planId?: string | null;
  repositoryId?: string | null;
  moduleId?: string | null;
  selectedCaseIds?: string[];
  /** 当前筛选下的用例数，用于范围提示 */
  filteredCount?: number;
};

const EXPORT_FIELD_GROUPS: TExportFieldGroup[] = [
  {
    label: "基础",
    fields: [
      { key: "code", label: "编号" },
      { key: "name", label: "名称" },
      { key: "repository_name", label: "用例库" },
      { key: "module_name", label: "模块" },
      { key: "type", label: "类型" },
      { key: "priority", label: "优先级" },
      { key: "test_type", label: "测试类型" },
      { key: "state", label: "状态" },
    ],
  },
  {
    label: "执行",
    fields: [
      { key: "result", label: "执行结果" },
      { key: "plan_assignee", label: "执行人" },
      { key: "review_status", label: "复核状态" },
    ],
  },
  {
    label: "内容",
    fields: [
      { key: "precondition", label: "前置条件" },
      { key: "steps", label: "步骤" },
      { key: "text_description", label: "文本描述" },
      { key: "text_result", label: "文本结果" },
      { key: "remark", label: "备注" },
    ],
  },
  {
    label: "其他",
    fields: [
      { key: "assignee", label: "维护人" },
      { key: "created_at", label: "创建时间" },
      { key: "updated_at", label: "更新时间" },
    ],
  },
];

const ALL_FIELD_KEYS = EXPORT_FIELD_GROUPS.flatMap((group) => group.fields.map((field) => field.key));
const DEFAULT_SELECTED_FIELDS = ["code", "name", "module_name", "priority", "result", "plan_assignee"];

export default function PlanCasesExportModal({
  open,
  onClose,
  workspaceSlug,
  planId,
  repositoryId,
  moduleId,
  selectedCaseIds,
  filteredCount,
}: Props) {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);
  const planService = useRef(new PlanService()).current;
  const [exporting, setExporting] = useState(false);
  const [scope, setScope] = useState<TExportScope>("filtered");
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(DEFAULT_SELECTED_FIELDS);

  const selectedCount = selectedCaseIds?.length ?? 0;

  useEffect(() => {
    if (!open) return;
    setSelectedExportFields(DEFAULT_SELECTED_FIELDS);
    setScope(selectedCount > 0 ? "selected" : "filtered");
  }, [open, selectedCount]);

  const scopeOptions = useMemo(
    () => [
      { key: "filtered" as const, label: "当前筛选", count: filteredCount, disabled: false },
      { key: "selected" as const, label: "已勾选", count: selectedCount, disabled: selectedCount === 0 },
      { key: "plan" as const, label: "整个计划", count: undefined, disabled: false },
    ],
    [filteredCount, selectedCount]
  );

  const toggleField = (key: string) => {
    setSelectedExportFields((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  const handleExport = async () => {
    if (!workspaceSlug || !planId) {
      qaCaseSetToastWarning("缺少必要参数");
      return;
    }
    if (!selectedExportFields.length) {
      qaCaseSetToastWarning("请至少选择一个字段");
      return;
    }
    try {
      setExporting(true);
      const payload: any = {
        plan_id: String(planId),
        // 按分组顺序输出，避免导出列顺序随点击顺序变化
        fields: ALL_FIELD_KEYS.filter((key) => selectedExportFields.includes(key)),
      };
      if (scope === "selected" && selectedCaseIds?.length) {
        payload.ids = selectedCaseIds.map(String);
      } else if (scope === "filtered") {
        if (repositoryId) payload.repository_id = String(repositoryId);
        if (moduleId) payload.module_id = String(moduleId);
      }
      const res = await planService.post(`/api/workspaces/${workspaceSlug}/test/plan/export/`, payload, {
        responseType: "blob",
      });
      const blob = res?.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `计划用例导出_${new Date().getTime()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch (e: unknown) {
      await qaCaseSetToastErrorFromAxios(e, t, "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const scopeHint =
    scope === "selected"
      ? `导出为 CSV，含已勾选的 ${selectedCount} 条用例`
      : scope === "plan"
        ? "导出为 CSV，含本计划的全部用例"
        : typeof filteredCount === "number"
          ? `导出为 CSV，含当前筛选下的 ${filteredCount} 条用例`
          : "导出为 CSV，含当前筛选下的用例";

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
            <Download className="size-[18px]" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-base leading-tight font-semibold text-primary">导出用例执行</h3>
            <p className="mt-1 text-13 leading-snug text-tertiary tabular-nums">{scopeHint}</p>
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
        <div
          ref={bodyRef}
          tabIndex={-1}
          className="vertical-scrollbar scrollbar-sm flex max-h-[60vh] flex-col gap-5 overflow-y-auto border-t border-subtle px-6 pt-5 pb-1 outline-none"
        >
          <div className="flex flex-col gap-2">
            <span className="text-13 font-medium text-primary">范围</span>
            <div className="inline-flex w-fit gap-0.5 rounded-lg border border-subtle bg-layer-1 p-0.5">
              {scopeOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => setScope(option.key)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md px-3.5 text-13 transition-colors",
                    scope === option.key
                      ? "bg-surface-1 font-medium text-primary shadow-raised-100"
                      : "text-secondary",
                    option.disabled && "cursor-not-allowed opacity-50"
                  )}
                >
                  {option.label}
                  {typeof option.count === "number" && (
                    <span className="rounded bg-layer-3 px-1.5 text-11 text-tertiary tabular-nums">{option.count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-13 font-medium text-primary">字段</span>
              <span className="text-12 text-tertiary tabular-nums">已选 {selectedExportFields.length}</span>
              <div className="ml-auto flex items-center gap-3 text-12">
                <button
                  type="button"
                  className="text-accent-primary transition-colors hover:text-accent-primary-hover"
                  onClick={() => setSelectedExportFields(ALL_FIELD_KEYS)}
                >
                  全选
                </button>
                <button
                  type="button"
                  className="text-accent-primary transition-colors hover:text-accent-primary-hover"
                  onClick={() => setSelectedExportFields(DEFAULT_SELECTED_FIELDS)}
                >
                  恢复默认
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {EXPORT_FIELD_GROUPS.map((group) => (
                <div key={group.label} className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-3">
                  <span className="pt-1.5 text-12 text-tertiary">{group.label}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.fields.map((field) => {
                      const isActive = selectedExportFields.includes(field.key);
                      return (
                        <button
                          key={field.key}
                          type="button"
                          onClick={() => toggleField(field.key)}
                          className={cn(
                            "inline-flex h-7 items-center rounded-md border px-2.5 text-13 transition-colors",
                            isActive
                              ? "border-accent-strong bg-accent-subtle font-medium text-accent-primary"
                              : "border-subtle text-secondary hover:bg-layer-1"
                          )}
                        >
                          {field.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 pt-4 pb-5">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={exporting}>
            取消
          </Button>
          <Button
            variant="primary"
            size="lg"
            loading={exporting}
            disabled={selectedExportFields.length === 0}
            onClick={handleExport}
          >
            导出 CSV
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
