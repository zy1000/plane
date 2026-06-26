import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { qaCaseSetToastError, qaCaseSetToastSuccess } from "@/utils/qa-case-error";
import { Button } from "@plane/propel/button";
import { Input, EModalPosition, EModalWidth, ModalCore, CustomSearchSelect } from "@plane/ui";
import { PlanService } from "@/services/qa/plan.service";
import { ReportService, type TReportType } from "@/services/qa/report.service";

type TMode = "create" | "edit";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  mode?: TMode;
  reportId?: string;
  initialData?: {
    name?: string;
    report_type?: TReportType;
    plans?: string[];
  } | null;
  onSuccess?: () => void | Promise<void>;
};

const planService = new PlanService();
const reportService = new ReportService();

const REPORT_TYPE_OPTIONS: { value: TReportType; label: string; disabled?: boolean }[] = [
  { value: "计划报告", label: "计划报告" },
  { value: "对外报告", label: "对外报告（敬请期待）", disabled: true },
];

export const CreateUpdateReportModal: React.FC<Props> = (props) => {
  const {
    isOpen,
    handleClose,
    workspaceSlug,
    projectId,
    mode = "create",
    reportId,
    initialData,
    onSuccess,
  } = props;

  const { t } = useTranslation();

  const [name, setName] = useState<string>(initialData?.name ?? "");
  const [reportType, setReportType] = useState<TReportType>(initialData?.report_type ?? "计划报告");
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>(initialData?.plans ?? []);
  const [planOptions, setPlanOptions] = useState<Array<{ value: string; query: string; content: React.ReactNode }>>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<{ name?: string; plans?: string }>({});

  const resetForm = () => {
    setName(initialData?.name ?? "");
    setReportType(initialData?.report_type ?? "计划报告");
    setSelectedPlanIds(initialData?.plans ?? []);
    setErrors({});
    setSubmitting(false);
  };

  const onCloseWithReset = () => {
    resetForm();
    handleClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    setName(initialData?.name ?? "");
    setReportType(initialData?.report_type ?? "计划报告");
    setSelectedPlanIds(initialData?.plans ?? []);
    setErrors({});
    setSubmitting(false);
  }, [isOpen, mode, reportId, initialData]);

  useEffect(() => {
    if (!isOpen || !workspaceSlug) return;
    planService
      .getPlanList(workspaceSlug, { project_id: projectId })
      .then((data: any) => {
        const list: Array<{ id: string; name: string }> = Array.isArray(data) ? data : [];
        setPlanOptions(
          list.map((p) => ({
            value: String(p.id),
            query: String(p.name),
            content: <span className="flex-grow truncate">{String(p.name)}</span>,
          }))
        );
      })
      .catch(() => setPlanOptions([]));
  }, [isOpen, workspaceSlug, projectId]);

  const title = useMemo(() => (mode === "edit" ? "编辑测试报告" : "新建测试报告"), [mode]);

  const validate = (): boolean => {
    const nextErrors: { name?: string; plans?: string } = {};
    if (!name || !name.trim()) nextErrors.name = "请输入报告名称";
    if (!selectedPlanIds || selectedPlanIds.length < 1) nextErrors.plans = "请至少选择一个测试计划";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      setSubmitting(true);
      const payload = {
        name: name.trim(),
        report_type: reportType,
        project: projectId,
        plans: selectedPlanIds,
      };
      if (mode === "create") {
        await reportService.createReport(workspaceSlug, projectId, payload);
      } else if (mode === "edit" && reportId) {
        await reportService.updateReport(workspaceSlug, projectId, { id: reportId, ...payload });
      }
      qaCaseSetToastSuccess(mode === "edit" ? "测试报告更新成功" : "测试报告创建成功");
      await onSuccess?.();
      onCloseWithReset();
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "操作失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const renderSelectedPlans = () => {
    if (!selectedPlanIds.length) {
      return <span className="text-placeholder">请选择关联测试计划（可多选）</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-1">
        {selectedPlanIds.map((id) => {
          const opt = planOptions.find((o) => o.value === id);
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded bg-accent-primary/10 px-2 py-0.5 text-xs text-accent-primary"
            >
              {opt?.query ?? id}
              <button
                type="button"
                className="text-accent-primary/60 hover:text-accent-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPlanIds((prev) => prev.filter((x) => x !== id));
                }}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onCloseWithReset} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="px-6 py-5">
        <h3 className="text-lg font-semibold mb-3">{title}</h3>
        <div className="grid grid-cols-1 gap-4 mt-4">
          <div className="col-span-1">
            <label className="text-sm text-secondary mb-1 block">
              报告名称<span className="text-danger-primary">*</span>
            </label>
            <Input
              placeholder="请输入报告名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full"
              hasError={Boolean(errors.name)}
            />
            <span className="text-caption-sm-medium text-danger-primary">{errors.name}</span>
          </div>

          <div className="col-span-1">
            <label className="text-sm text-secondary mb-1 block">报告类型</label>
            <div className="flex items-center gap-4">
              {REPORT_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`inline-flex items-center gap-2 text-sm ${opt.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                >
                  <input
                    type="radio"
                    name="report-type"
                    value={opt.value}
                    checked={reportType === opt.value}
                    disabled={opt.disabled}
                    onChange={() => setReportType(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="col-span-1">
            <label className="text-sm text-secondary mb-1 block">
              关联测试计划<span className="text-danger-primary">*</span>
            </label>
            <CustomSearchSelect
              className="w-full"
              value={selectedPlanIds}
              onChange={(val: string | string[] | null) => {
                if (!val) return;
                if (Array.isArray(val)) {
                  setSelectedPlanIds(val.map(String));
                  return;
                }
                setSelectedPlanIds((prev) => (prev.includes(val) ? prev.filter((id) => id !== val) : [...prev, val]));
              }}
              options={planOptions}
              multiple={true}
              customButtonClassName="w-full hover:bg-transparent focus:bg-transparent active:bg-transparent"
              customButton={
                <div
                  className={`flex w-full items-center justify-between gap-1 rounded border-[0.5px] px-3 py-2 text-sm ${
                    errors.plans ? "border-danger-strong" : "border-subtle-1"
                  }`}
                >
                  {renderSelectedPlans()}
                </div>
              }
            />
            <span className="text-caption-sm-medium text-danger-primary">{errors.plans}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onCloseWithReset} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            disabled={submitting}
            data-testid="qa-report-submit"
          >
            {mode === "edit" ? "保存" : "创建"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
