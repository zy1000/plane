import React, { useMemo, useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button } from "@plane/propel/button";
import { Input, TextArea, EModalPosition, EModalWidth, ModalCore, CustomSearchSelect } from "@plane/ui";
import { CalendarDays } from "lucide-react";
import { DateDropdown } from "@/components/dropdowns/date";
import { renderFormattedPayloadDate } from "@plane/utils";
// services
import { PlanService } from "@/services/qa/plan.service";
import { RepositoryService } from "@/services/qa/repository.service";
import { CaseService } from "@/services/qa/case.service";
import { CycleService } from "@/services/cycle.service";

type TMode = "create" | "edit";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  // 只读展示字段
  repositoryId: string;
  repositoryName: string;
  // 预留编辑模式
  mode?: TMode;
  planId?: string;
  initialData?: {
    name?: string;
    assignees?: string[];
    description?: string;
    module?: string | null;
    cycle?: string | null;
    begin_time?: string | Date | null;
    end_time?: string | Date | null;
    threshold?: number | null;
  } | null;
  // 创建成功/编辑成功回调（用于刷新列表或其它联动）
  onSuccess?: () => void | Promise<void>;
};

const planService = new PlanService();
const cycleService = new CycleService();

export const CreateUpdatePlanModal: React.FC<Props> = (props) => {
  const {
    isOpen,
    handleClose,
    workspaceSlug,
    projectId,
    repositoryId,
    repositoryName,
    mode = "create",
    planId,
    initialData,
    onSuccess,
  } = props;

  // 表单状态
  const [name, setName] = useState<string>(initialData?.name ?? "");
  const [description, setDescription] = useState<string>(initialData?.description ?? "");
  const [moduleId, setModuleId] = useState<string | null>(initialData?.module ?? null);
  const [cycleId, setCycleId] = useState<string | null>(initialData?.cycle ?? null);

  const [beginTime, setBeginTime] = useState<Date | null>(
    initialData?.begin_time ? new Date(initialData?.begin_time as any) : null
  );
  const [endTime, setEndTime] = useState<Date | null>(
    initialData?.end_time ? new Date(initialData?.end_time as any) : null
  );
  const [threshold, setThreshold] = useState<number>(initialData?.threshold ?? 100);
  const [moduleOptions, setModuleOptions] = useState<Array<{ value: string; query: string; content: React.ReactNode }>>(
    []
  );
  const [cycleOptions, setCycleOptions] = useState<Array<{ value: string; query: string; content: React.ReactNode }>>(
    []
  );
  const [stateValue] = useState<number>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<{ name?: string; time?: string; module?: string; threshold?: string }>({});

  // 新增：关闭时重置所有字段
  const resetForm = () => {
    setName(initialData?.name ?? "");
    setDescription(initialData?.description ?? "");
    setModuleId(initialData?.module ?? null);
    setCycleId(initialData?.cycle ?? null);
    if (mode === "create") {
      setBeginTime(null);
      setEndTime(null);
    } else {
      setBeginTime(initialData?.begin_time ? new Date(initialData?.begin_time as any) : null);
      setEndTime(initialData?.end_time ? new Date(initialData?.end_time as any) : null);
    }
    setThreshold(initialData?.threshold ?? 100);
    setErrors({});
    setSubmitting(false);
  };

  const onCloseWithReset = () => {
    resetForm();
    handleClose();
  };

  // 新增：当弹窗打开或依赖变更时，同步最新 props 到内部表单状态
  React.useEffect(() => {
    if (!isOpen) return;
    if (mode === "edit") {
      setName(initialData?.name ?? "");
      setDescription(initialData?.description ?? "");
      setModuleId(initialData?.module ?? null);
      setCycleId(initialData?.cycle ?? null);
      setBeginTime(initialData?.begin_time ? new Date(initialData?.begin_time as any) : null);
      setEndTime(initialData?.end_time ? new Date(initialData?.end_time as any) : null);
    } else {
      setName("");
      setDescription("");
      setModuleId(null);
      setCycleId(null);
      setBeginTime(null);
      setEndTime(null);
    }
    setErrors({});
    setSubmitting(false);
  }, [isOpen, mode, planId, initialData]);

  React.useEffect(() => {
    if (!isOpen) return;
    const repositoryService = new RepositoryService();
    repositoryService
      .enumsList(workspaceSlug)
      .then(() => {})
      .catch(() => {});
    if (workspaceSlug && projectId) {
      planService
        .getPlanModules(String(workspaceSlug), String(projectId))
        .then((data: any[]) => {
          const flatten = (nodes: any[]): any[] =>
            (nodes || []).flatMap((n) => [n, ...(Array.isArray(n?.children) ? flatten(n.children) : [])]);
          const list = flatten(Array.isArray(data) ? data : []);
          const opts = list.map((m: any) => ({
            value: String(m.id),
            query: String(m.name),
            content: <span className="flex-grow truncate">{String(m.name)}</span>,
          }));
          setModuleOptions(opts);
          if (mode === "create" && !moduleId) {
            const def = list.find((m: any) => m?.is_default);
            if (def) setModuleId(String(def.id));
          }
        })
        .catch(() => setModuleOptions([]));
    } else {
      setModuleOptions([]);
    }

    if (workspaceSlug && projectId) {
      cycleService
        .getCyclesWithStatus(workspaceSlug, projectId, ["CURRENT", "UPCOMING"])
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          const opts = list.map((c: any) => ({
            value: String(c.id),
            query: String(c.name),
            content: <span className="flex-grow truncate">{String(c.name)}</span>,
          }));
          setCycleOptions(opts);
        })
        .catch(() => setCycleOptions([]));
    }
  }, [isOpen, workspaceSlug, repositoryId, projectId]);

  const title = useMemo(() => (mode === "edit" ? "编辑测试计划" : "新建测试计划"), [mode]);

  // 简单校验：名称必填、结束时间不早于开始时间
  const validate = (): boolean => {
    const nextErrors: { name?: string; time?: string; module?: string; threshold?: string } = {};
    if (!name || !name.trim()) {
      nextErrors.name = "请输入计划名称";
    }
    if (beginTime && endTime && endTime.getTime() < beginTime.getTime()) {
      nextErrors.time = "结束时间不能早于开始时间";
    }

    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      nextErrors.threshold = "阀值范围为 0 - 100";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      setSubmitting(true);

      const payload: any = {
        name: name.trim(),
        project: projectId,
        description: description || "",
        begin_time: beginTime ? renderFormattedPayloadDate(beginTime) : null,
        end_time: endTime ? renderFormattedPayloadDate(endTime) : null,
        threshold,
        module: moduleId,
        cycle: cycleId,
      };

      if (mode === "create") {
        await planService.createPlan(workspaceSlug, payload);
      } else if (mode === "edit" && planId) {
        await planService.updatePlan(workspaceSlug, {
          id: planId,
          name: payload.name,
          description: payload.description,
          threshold: payload.threshold,
          begin_time: payload.begin_time,
          end_time: payload.end_time,
          module: payload.module,
          cycle: payload.cycle,
        });
      }

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "成功",
        message: mode === "edit" ? "测试计划更新成功" : "测试计划创建成功",
      });

      await onSuccess?.();

      // 关闭并重置
      onCloseWithReset();
    } catch (e: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "失败",
        message: e?.message || e?.detail || e?.error || "操作失败，请稍后重试",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onCloseWithReset} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="px-6 py-5">
        <h3 className="text-lg font-semibold mb-3">{title}</h3>
        <div className="grid grid-cols-1 gap-4 mt-4">
          {/* 计划名称（必填，红色星号） */}
          <div className="col-span-1">
            <label className="text-sm text-custom-text-300 mb-1 block">
              计划名称<span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="请输入计划名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* 描述（可选） */}
          <div className="col-span-1">
            <label className="text-sm text-custom-text-300 mb-1 block">描述</label>
            <TextArea
              rows={3}
              placeholder="请输入描述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-24"
            />
          </div>

          {/* 所属模块（下拉选择，可搜索，必选） */}
          <div className="col-span-1">
            <label className="text-sm text-custom-text-300 mb-1 block">
              所属模块
            </label>
            <CustomSearchSelect
              className="w-[320px]"
              value={moduleId ?? undefined}
              onChange={(val: string | null) => setModuleId(val ?? null)}
              options={moduleOptions}
              multiple={false}
              customButtonClassName="w-full hover:bg-transparent focus:bg-transparent active:bg-transparent"
              customButton={
                <div className="flex w-full max-w-[320px] items-center justify-between gap-1 rounded border-[0.5px] border-custom-border-300 px-3 py-2 text-sm">
                  <span className="flex-grow truncate">
                    {moduleOptions.find((o) => o.value === moduleId)?.content || (
                      <span className="text-custom-text-400">请选择所属模块</span>
                    )}
                  </span>
                </div>
              }
            />
            {errors.module && <p className="text-xs text-red-500 mt-1">{errors.module}</p>}
          </div>

          {/* 关联迭代（下拉选择，可搜索，单选） */}
          <div className="col-span-1">
            <label className="text-sm text-custom-text-300 mb-1 block">关联迭代</label>
            <CustomSearchSelect
              className="w-[320px]"
              value={cycleId ?? undefined}
              onChange={(val: string | null) => setCycleId(val ?? null)}
              options={cycleOptions}
              multiple={false}
              customButtonClassName="w-full hover:bg-transparent focus:bg-transparent active:bg-transparent"
              customButton={
                <div className="flex w-full max-w-[320px] items-center justify-between gap-1 rounded border-[0.5px] border-custom-border-300 px-3 py-2 text-sm">
                  <span className="flex-grow truncate">
                    {cycleOptions.find((o) => o.value === cycleId)?.content || (
                      <span className="text-custom-text-400">请选择关联迭代</span>
                    )}
                  </span>
                </div>
              }
            />
          </div>

          {/* 计划起止时间样式参照 CreateReviewModal.tsx L177-200 */}
          <div className="col-span-1">
            <label className="text-sm text-custom-text-300 mb-1 block">计划周期</label>
            <div className="flex items-center gap-2">
              <div className="h-9 w-56">
                <DateDropdown
                  value={beginTime}
                  onChange={(val) => setBeginTime(val)}
                  placeholder="开始日期"
                  icon={<CalendarDays className="h-3 w-3 flex-shrink-0" />}
                  buttonVariant="border-with-text"
                  buttonClassName="border-custom-border-300 px-3 py-2.5 text-left"
                  buttonContainerClassName="w-full text-left"
                  optionsClassName="z-[50]"
                  maxDate={endTime ?? undefined}
                  formatToken="yyyy-MM-dd"
                  renderByDefault
                />
              </div>
              <span>至</span>
              <div className="h-9 w-56">
                <DateDropdown
                  value={endTime}
                  onChange={(val) => setEndTime(val)}
                  placeholder="结束日期"
                  icon={<CalendarDays className="h-3 w-3 flex-shrink-0" />}
                  buttonVariant="border-with-text"
                  buttonClassName="border-custom-border-300 px-3 py-2.5 text-left"
                  buttonContainerClassName="w-full text-left"
                  optionsClassName="z-[50]"
                  minDate={beginTime ?? undefined}
                  formatToken="yyyy-MM-dd"
                  renderByDefault
                />
              </div>
            </div>
            {errors.time && <p className="text-xs text-red-500 mt-1">{errors.time}</p>}
          </div>

          {/* 通过阀值（数字输入，带加减按钮，范围 0-100） */}
          <div className="col-span-1">
            <label className="text-sm text-custom-text-300 mb-1 block">通过阀值</label>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setThreshold((prev) => Math.max(0, Math.min(100, (Number(prev) || 0) - 1)))}
              >
                -
              </Button>
              <Input
                type="number"
                value={String(threshold)}
                onChange={(e) => {
                  const v = e.target.value;
                  const num = v === "" ? 0 : Number(v);
                  if (Number.isFinite(num)) setThreshold(Math.max(0, Math.min(100, num)));
                }}
                className="w-24"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => setThreshold((prev) => Math.max(0, Math.min(100, (Number(prev) || 0) + 1)))}
              >
                +
              </Button>
              <span className="text-sm text-custom-text-400">范围 0 - 100%</span>
            </div>
            {errors.threshold && <p className="text-xs text-red-500 mt-1">{errors.threshold}</p>}
          </div>
        </div>

        {/* 操作区 */}
        <div className="flex items-center justify-end gap-2 mt-6">
          <Button variant="primary" size="sm" onClick={onCloseWithReset} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            loading={submitting}
            disabled={submitting}
            data-testid="qa-plan-submit"
          >
            {mode === "edit" ? "保存" : "创建"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
