import React, { useMemo, useRef, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { ArrowRight, ChevronDown, ChevronUp, ClipboardCheck } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { ChevronDownIcon, CloseIcon } from "@plane/propel/icons";
import { CustomSearchSelect, EModalPosition, EModalWidth, ModalCore, TextArea } from "@plane/ui";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { FORM_VARIANT_STYLES, FormFieldGroup, FormFieldShell, getFormGridClassName } from "@/components/common/form-section";
import { DateDropdown } from "@/components/dropdowns/date";
import { PlanReviewRuleFields } from "./plan-review-rule-fields";
import { usePlanReviewRule } from "./use-plan-review-rule";
import type { TPlanReviewApprovalType } from "@/services/qa/plan.service";
import { qaCaseSetToastError, qaCaseSetToastSuccess } from "@/utils/qa-case-error";
// services
import { PlanService } from "@/services/qa/plan.service";
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
  autoSelectDefaultModule?: boolean;
  planId?: string;
  initialData?: {
    name?: string;
    description?: string;
    module?: string | null;
    cycle?: string | null;
    begin_time?: string | Date | null;
    end_time?: string | Date | null;
    threshold?: number | null;
    reviewers?: string[] | null;
    review_approval_type?: TPlanReviewApprovalType | null;
    review_required_count?: number | null;
  } | null;
  // 创建成功/编辑成功回调（用于刷新列表或其它联动）
  onSuccess?: () => void | Promise<void>;
};

type TSelectOption = { value: string; query: string; content: React.ReactNode };

const planService = new PlanService();
const cycleService = new CycleService();

const styles = FORM_VARIANT_STYLES["grouped-modal"];
const grid = getFormGridClassName("grouped-modal");

const clampThreshold = (value: number) => Math.max(0, Math.min(100, value));

/** 分组弹窗里的可搜索下拉按钮：与 input / DateDropdown 同高同圆角 */
const SelectButton = ({
  label,
  placeholder,
  hasError,
}: {
  label?: React.ReactNode;
  placeholder: string;
  hasError?: boolean;
}) => (
  <div className={cn(styles.select, "justify-between gap-2", hasError && "border-danger-strong")}>
    <span className="min-w-0 flex-1 truncate">{label ?? <span className="text-placeholder">{placeholder}</span>}</span>
    <ChevronDownIcon className="size-3.5 shrink-0 text-tertiary" aria-hidden="true" />
  </div>
);

/**
 * 新建 / 编辑测试计划弹窗。与创建项目、产品弹窗同一套「身份区 + 分组字段」结构：
 * 顶部大字名称，下面 归属 / 复核 / 排期 / 通过阈值 / 描述 五组，组名靠左、字段靠右。
 */
export const CreateUpdatePlanModal: React.FC<Props> = (props) => {
  const {
    isOpen,
    handleClose,
    workspaceSlug,
    projectId,
    repositoryId,
    mode = "create",
    autoSelectDefaultModule = true,
    planId,
    initialData,
    onSuccess,
  } = props;

  const { t } = useTranslation();
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // 表单状态
  const [name, setName] = useState<string>(initialData?.name ?? "");
  const [description, setDescription] = useState<string>(initialData?.description ?? "");
  const [moduleId, setModuleId] = useState<string | null>(initialData?.module ?? null);
  const [cycleId, setCycleId] = useState<string | null>(initialData?.cycle ?? null);
  const reviewRule = usePlanReviewRule({
    reviewers: initialData?.reviewers,
    review_approval_type: initialData?.review_approval_type,
    review_required_count: initialData?.review_required_count,
  });

  const [beginTime, setBeginTime] = useState<Date | null>(
    initialData?.begin_time ? new Date(initialData?.begin_time as any) : null
  );
  const [endTime, setEndTime] = useState<Date | null>(
    initialData?.end_time ? new Date(initialData?.end_time as any) : null
  );
  const [threshold, setThreshold] = useState<number>(initialData?.threshold ?? 100);
  const [moduleOptions, setModuleOptions] = useState<TSelectOption[]>([]);
  const [cycleOptions, setCycleOptions] = useState<TSelectOption[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<{
    name?: string;
    time?: string;
    module?: string;
    threshold?: string;
  }>({});

  // 关闭时重置所有字段
  const resetForm = () => {
    setName(initialData?.name ?? "");
    setDescription(initialData?.description ?? "");
    setModuleId(initialData?.module ?? null);
    setCycleId(initialData?.cycle ?? null);
    reviewRule.reset({
      reviewers: initialData?.reviewers,
      review_approval_type: initialData?.review_approval_type,
      review_required_count: initialData?.review_required_count,
    });
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

  // 当弹窗打开或依赖变更时，同步最新 props 到内部表单状态
  React.useEffect(() => {
    if (!isOpen) return;
    setName(initialData?.name ?? "");
    setDescription(initialData?.description ?? "");
    setModuleId(initialData?.module ?? null);
    setCycleId(initialData?.cycle ?? null);
    reviewRule.reset({
      reviewers: initialData?.reviewers,
      review_approval_type: initialData?.review_approval_type,
      review_required_count: initialData?.review_required_count,
    });
    if (mode === "edit") {
      setBeginTime(initialData?.begin_time ? new Date(initialData?.begin_time as any) : null);
      setEndTime(initialData?.end_time ? new Date(initialData?.end_time as any) : null);
    } else {
      setBeginTime(null);
      setEndTime(null);
    }
    setErrors({});
    setSubmitting(false);
  }, [isOpen, mode, planId, initialData]);

  React.useEffect(() => {
    if (!isOpen) return;
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
          if (mode === "create" && autoSelectDefaultModule && !moduleId) {
            const def = list.find((m: any) => m?.is_default);
            if (def) setModuleId(String(def.id));
          }
        })
        .catch(() => setModuleOptions([]));

      cycleService
        .getCyclesWithStatus(workspaceSlug, projectId, ["进行中", "未开始", "测试中"])
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
    } else {
      setModuleOptions([]);
    }
  }, [isOpen, workspaceSlug, repositoryId, projectId, autoSelectDefaultModule]);

  const title = useMemo(() => (mode === "edit" ? "编辑测试计划" : "新建测试计划"), [mode]);

  // 起止都填了且没颠倒才算天数，首尾两天都算在内
  const durationDays =
    beginTime && endTime && endTime >= beginTime ? differenceInCalendarDays(endTime, beginTime) + 1 : null;

  // 简单校验：名称必填、结束时间不早于开始时间
  const validate = (): boolean => {
    const nextErrors: { name?: string; time?: string; module?: string; threshold?: string } = {};
    if (!name || !name.trim()) {
      nextErrors.name = "请输入计划名称";
    }
    if (!moduleId) {
      nextErrors.module = "请选择所属模块";
    }
    if (beginTime && endTime && endTime.getTime() < beginTime.getTime()) {
      nextErrors.time = "结束时间不能早于开始时间";
    }

    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      nextErrors.threshold = "阈值范围为 0 - 100";
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
        ...reviewRule.buildPayload(),
      };

      if (mode === "create") {
        await planService.createPlan(workspaceSlug, projectId, payload);
      } else if (mode === "edit" && planId) {
        await planService.updatePlan(workspaceSlug, projectId, {
          id: planId,
          name: payload.name,
          description: payload.description,
          threshold: payload.threshold,
          begin_time: payload.begin_time,
          end_time: payload.end_time,
          module: payload.module,
          cycle: payload.cycle,
          reviewers: payload.reviewers,
          review_approval_type: payload.review_approval_type,
          review_required_count: payload.review_required_count,
        });
      }

      qaCaseSetToastSuccess(mode === "edit" ? "测试计划更新成功" : "测试计划创建成功");

      await onSuccess?.();

      // 关闭并重置
      onCloseWithReset();
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "操作失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const selectButtonClassName = "w-full hover:bg-transparent focus:bg-transparent active:bg-transparent";

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onCloseWithReset}
      position={EModalPosition.TOP}
      width={EModalWidth.XXXXL}
      className="rounded-2xl sm:max-w-[50rem]"
      initialFocus={nameInputRef}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        className="flex max-h-[min(88vh,52rem)] min-h-0 flex-col"
      >
        {/* 身份区：图标块 + 弹窗标题小字 + 大字计划名 */}
        <div className="grid shrink-0 grid-cols-[64px_minmax(0,1fr)_auto] items-start gap-x-4 px-8 pt-7 pb-5">
          <div className="grid size-16 place-items-center rounded-2xl bg-accent-subtle text-accent-primary">
            <ClipboardCheck className="size-7" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-12 font-medium text-tertiary">{title}</p>
            <input
              id="plan-name"
              name="name"
              type="text"
              autoComplete="off"
              ref={nameInputRef}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              maxLength={255}
              placeholder="输入计划名称"
              className={cn(
                "block w-full border-0 border-b-2 border-transparent bg-transparent px-0 py-1 text-[22px] leading-tight font-semibold tracking-tight text-primary outline-none placeholder:font-medium placeholder:text-placeholder focus:border-accent-strong",
                Boolean(errors.name) && "border-danger-strong"
              )}
            />
            {errors.name ? <p className={styles.error}>{errors.name}</p> : null}
          </div>
          <button
            type="button"
            onClick={onCloseWithReset}
            className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label={t("close")}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div data-modal-wheel-scroll className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-8">
          <FormFieldGroup title="归属">
            <div className={grid}>
              <FormFieldShell label="所属模块" required editable styles={styles} error={errors.module}>
                <CustomSearchSelect
                  value={moduleId ?? undefined}
                  onChange={(val: string | null) => {
                    setModuleId(val ?? null);
                    if (errors.module) setErrors((prev) => ({ ...prev, module: undefined }));
                  }}
                  options={moduleOptions}
                  multiple={false}
                  customButtonClassName={selectButtonClassName}
                  customButton={
                    <SelectButton
                      label={moduleOptions.find((o) => o.value === moduleId)?.content}
                      placeholder="请选择所属模块"
                      hasError={Boolean(errors.module)}
                    />
                  }
                />
              </FormFieldShell>
              <FormFieldShell label="关联迭代" required={false} editable styles={styles}>
                <CustomSearchSelect
                  value={cycleId ?? undefined}
                  onChange={(val: string | null) => setCycleId(val ?? null)}
                  options={cycleOptions}
                  multiple={false}
                  customButtonClassName={selectButtonClassName}
                  customButton={
                    <SelectButton
                      label={cycleOptions.find((o) => o.value === cycleId)?.content}
                      placeholder="请选择关联迭代"
                    />
                  }
                />
              </FormFieldShell>
            </div>
          </FormFieldGroup>

          {/* 复核人（可多人）+ 通过规则：只有复核人能复核该计划下用例的执行结果 */}
          <FormFieldGroup title="复核" optional>
            <div className={grid}>
              <PlanReviewRuleFields
                projectId={projectId ? String(projectId) : undefined}
                reviewerIds={reviewRule.reviewerIds}
                approvalType={reviewRule.approvalType}
                requiredCount={reviewRule.requiredCount}
                onReviewerIdsChange={reviewRule.setReviewerIds}
                onApprovalTypeChange={reviewRule.setApprovalType}
                onRequiredCountChange={reviewRule.setRequiredCount}
              />
            </div>
          </FormFieldGroup>

          <FormFieldGroup title="排期" optional>
            <div className="flex items-start gap-2.5">
              <FormFieldShell label="开始日期" labelHidden required={false} editable styles={styles} className="flex-1">
                <div className={styles.control}>
                  <DateDropdown
                    value={beginTime}
                    onChange={(val) => setBeginTime(val)}
                    placeholder="开始日期"
                    buttonVariant="border-with-text"
                    className="h-full w-full"
                    buttonContainerClassName="h-full w-full"
                    buttonClassName={cn(styles.dropdownButton, errors.time && "border-danger-strong")}
                    labelClassName={styles.dropdownLabel}
                    optionsClassName="z-[50]"
                    maxDate={endTime ?? undefined}
                    formatToken="yyyy-MM-dd"
                  />
                </div>
              </FormFieldShell>
              <ArrowRight className="mt-[11px] size-4 shrink-0 text-tertiary" aria-hidden="true" />
              <FormFieldShell label="结束日期" labelHidden required={false} editable styles={styles} className="flex-1">
                <div className={styles.control}>
                  <DateDropdown
                    value={endTime}
                    onChange={(val) => setEndTime(val)}
                    placeholder="结束日期"
                    buttonVariant="border-with-text"
                    className="h-full w-full"
                    buttonContainerClassName="h-full w-full"
                    buttonClassName={cn(styles.dropdownButton, errors.time && "border-danger-strong")}
                    labelClassName={styles.dropdownLabel}
                    optionsClassName="z-[50]"
                    minDate={beginTime ?? undefined}
                    formatToken="yyyy-MM-dd"
                  />
                </div>
              </FormFieldShell>
              {durationDays !== null ? (
                <span className="flex h-[38px] shrink-0 items-center rounded-lg bg-accent-subtle px-3 text-13 font-medium text-accent-primary tabular-nums">
                  共 {durationDays} 天
                </span>
              ) : null}
            </div>
            {errors.time ? <p className={styles.error}>{errors.time}</p> : null}
          </FormFieldGroup>

          <FormFieldGroup title="通过阈值">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-[38px] w-[150px] items-stretch overflow-hidden rounded-lg border border-subtle-1 focus-within:border-accent-strong",
                  errors.threshold && "border-danger-strong"
                )}
              >
                <input
                  id="plan-threshold"
                  type="number"
                  min={0}
                  max={100}
                  value={String(threshold)}
                  onChange={(e) => {
                    const v = e.target.value;
                    const num = v === "" ? 0 : Number(v);
                    if (Number.isFinite(num)) setThreshold(clampThreshold(num));
                  }}
                  className="min-w-0 flex-1 bg-transparent pl-3 text-15 font-medium text-primary tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="flex items-center pr-2 text-13 text-tertiary">%</span>
                <div className="flex w-7 flex-col border-l border-subtle-1">
                  <button
                    type="button"
                    aria-label="增加"
                    onClick={() => setThreshold((prev) => clampThreshold((Number(prev) || 0) + 1))}
                    className="grid flex-1 place-items-center border-b border-subtle-1 text-tertiary hover:bg-layer-1 hover:text-primary"
                  >
                    <ChevronUp className="size-3" strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    aria-label="减少"
                    onClick={() => setThreshold((prev) => clampThreshold((Number(prev) || 0) - 1))}
                    className="grid flex-1 place-items-center text-tertiary hover:bg-layer-1 hover:text-primary"
                  >
                    <ChevronDown className="size-3" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <span className="text-12 text-tertiary">成功用例占比达到阈值即判定通过</span>
            </div>
            {errors.threshold ? <p className={styles.error}>{errors.threshold}</p> : null}
          </FormFieldGroup>

          <FormFieldGroup title="描述" optional>
            <TextArea
              id="plan-description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="!h-24 rounded-lg border !border-subtle-1 text-14"
            />
          </FormFieldGroup>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-subtle px-8 py-4">
          <Button variant="secondary" size="lg" type="button" onClick={onCloseWithReset} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="primary"
            size="lg"
            type="submit"
            loading={submitting}
            disabled={submitting}
            data-testid="qa-plan-submit"
          >
            {mode === "edit" ? "保存" : "创建"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
};
