import { useEffect, useMemo, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { ChevronDownIcon, CloseIcon } from "@plane/propel/icons";
import type { TCreateProjectStagePayload, TProjectStage, TStageType, TUpdateProjectStagePayload } from "@plane/types";
import { PROJECT_STAGE_MAX_WORKLOAD_RATIO } from "@plane/types";
import { CustomSelect, EModalPosition, EModalWidth, ModalCore, TextArea, ToggleSwitch } from "@plane/ui";
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";
import { FORM_VARIANT_STYLES, FormFieldGroup, FormFieldShell, getFormGridClassName } from "@/components/common/form-section";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { getProjectStageError } from "@/hooks/store/use-project-stages";

const I18N = "project_stage.form";
const styles = FORM_VARIANT_STYLES["grouped-modal"];

export type TProjectStageFormMode =
  | { mode: "create" }
  | { mode: "create-child"; parent: TProjectStage }
  | { mode: "edit"; stage: TProjectStage };

type TFormValue = {
  stageTypeId: string;
  name: string;
  description: string;
  isMilestone: boolean;
  parentId: string | null;
  ownerId: string | null;
  workloadRatio: string;
  startDate: string | null;
  endDate: string | null;
};

const EMPTY: TFormValue = {
  stageTypeId: "",
  name: "",
  description: "",
  isMilestone: false,
  parentId: null,
  ownerId: null,
  workloadRatio: "",
  startDate: null,
  endDate: null,
};

const SelectButton = ({ label, placeholder, disabled }: { label?: string; placeholder: string; disabled?: boolean }) => (
  <div className={cn(styles.select, "justify-between gap-2", disabled && "cursor-not-allowed bg-layer-1 text-tertiary")}>
    <span className="min-w-0 flex-1 truncate">{label ?? <span className="text-placeholder">{placeholder}</span>}</span>
    <ChevronDownIcon className="size-3.5 shrink-0 text-tertiary" aria-hidden="true" />
  </div>
);

/**
 * 新建 / 新建子阶段 / 编辑，grouped-modal 变体：身份区（阶段类型 + 大字名称）+ 层级 / 排期 / 负责与占比 / 描述四组。
 *
 * - 父阶段创建后不可改（编辑态锁死）；带来源的阶段类型不可改。
 * - 排期的 min / max 直接取父阶段范围，越界在选日期时就选不到。
 * - 占比即时校验：叶子累计 + 本次 > 100 时红字并禁用提交；有子阶段的阶段占比等于子之和，不给填。
 *   新建子阶段且父是带占比的叶子时，父的占比会下移给这个子（后端做），这里提示一句。
 */
export const ProjectStageFormModal = ({
  isOpen,
  form,
  projectId,
  stages,
  stageTypes,
  workloadTotal,
  isSubmitting,
  onClose,
  onCreate,
  onUpdate,
}: {
  isOpen: boolean;
  form: TProjectStageFormMode | null;
  projectId: string;
  stages: TProjectStage[];
  stageTypes: TStageType[];
  /** 叶子占比合计（含正在编辑的这一行） */
  workloadTotal: number;
  isSubmitting: boolean;
  onClose: () => void;
  onCreate: (payload: TCreateProjectStagePayload) => Promise<unknown>;
  onUpdate: (stageId: string, payload: TUpdateProjectStagePayload) => Promise<unknown>;
}) => {
  const { t } = useTranslation();
  const nameRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState<TFormValue>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const editing = form?.mode === "edit" ? form.stage : null;
  const fixedParent = form?.mode === "create-child" ? form.parent : null;
  const byId = useMemo(() => new Map(stages.map((stage) => [stage.id, stage])), [stages]);

  useEffect(() => {
    if (!isOpen || !form) return;
    if (form.mode === "edit") {
      const stage = form.stage;
      setValue({
        stageTypeId: stage.stage_type_id,
        name: stage.name,
        description: stage.description ?? "",
        isMilestone: stage.is_milestone,
        parentId: stage.parent_id,
        ownerId: stage.owner_id,
        workloadRatio: stage.workload_ratio === null ? "" : Number(stage.workload_ratio).toString(),
        startDate: stage.start_date,
        endDate: stage.end_date,
      });
    } else {
      const parent = form.mode === "create-child" ? form.parent : null;
      const defaultType = parent ? parent.stage_type_id : (stageTypes[0]?.id ?? "");
      setValue({ ...EMPTY, stageTypeId: defaultType, parentId: parent?.id ?? null });
    }
    setError(null);
  }, [isOpen, form, stageTypes]);

  const selectedType = stageTypes.find((item) => item.id === value.stageTypeId) ?? null;
  const parent = value.parentId ? (byId.get(value.parentId) ?? null) : null;
  const hasChildren = Boolean(editing && editing.children_count > 0);
  const typeLocked = Boolean(editing?.source_stage_id);
  const parentLocked = Boolean(editing) || Boolean(fixedParent);

  // 叶子累计里要排除：编辑的自己；新建子阶段时即将变非叶子的父
  const excluded = editing
    ? Number(editing.children_count > 0 ? 0 : (editing.workload_ratio ?? 0))
    : parent && parent.children_count === 0
      ? Number(parent.workload_ratio ?? 0)
      : 0;
  const remaining = Math.round((PROJECT_STAGE_MAX_WORKLOAD_RATIO - workloadTotal + excluded) * 100) / 100;
  const inheritedRatio =
    !editing && parent && parent.children_count === 0 && parent.workload_ratio !== null
      ? Number(parent.workload_ratio)
      : null;
  const ratioNumber = value.workloadRatio.trim() === "" ? null : Number(value.workloadRatio);
  const isRatioInvalid =
    ratioNumber !== null &&
    (Number.isNaN(ratioNumber) || ratioNumber < 0 || Math.round(ratioNumber * 100) > Math.round(remaining * 100));

  const parentCandidates = useMemo(
    () => stages.filter((stage) => stage.id !== editing?.id).sort((a, b) => a.sort_order - b.sort_order),
    [stages, editing?.id]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.stageTypeId) return setError(t(`${I18N}.stage_type_required`));
    if (isRatioInvalid) return;
    setError(null);
    const name = value.name.trim() || (selectedType?.name ?? "");
    const ratio = value.workloadRatio.trim() === "" ? null : value.workloadRatio.trim();
    try {
      if (editing) {
        const payload: TUpdateProjectStagePayload = {
          name,
          description: value.description,
          is_milestone: value.isMilestone,
          owner_id: value.ownerId,
          start_date: value.startDate,
          end_date: value.endDate,
        };
        if (!typeLocked) payload.stage_type_id = value.stageTypeId;
        if (!hasChildren) payload.workload_ratio = ratio;
        await onUpdate(editing.id, payload);
      } else {
        await onCreate({
          stage_type_id: value.stageTypeId,
          name,
          description: value.description,
          is_milestone: value.isMilestone,
          parent_id: value.parentId,
          owner_id: value.ownerId,
          workload_ratio: ratio,
          start_date: value.startDate,
          end_date: value.endDate,
        });
      }
      onClose();
    } catch (submitError) {
      const { message, code } = getProjectStageError(submitError);
      const known = code ? t(`project_stage.errors.${code.toLowerCase()}`) : "";
      setError(known && known !== `project_stage.errors.${code?.toLowerCase()}` ? known : message);
    }
  };

  const title =
    form?.mode === "edit"
      ? t(`${I18N}.edit_title`)
      : form?.mode === "create-child"
        ? t(`${I18N}.create_child_title`)
        : t(`${I18N}.create_title`);

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.TOP}
      width={EModalWidth.XXXXL}
      className="rounded-2xl sm:max-w-[48rem]"
      initialFocus={nameRef}
    >
      <form onSubmit={handleSubmit} className="flex max-h-[min(88vh,52rem)] min-h-0 flex-col">
        {/* 身份区：图标块 + 阶段类型下拉 + 大字名称 */}
        <div className="grid shrink-0 grid-cols-[64px_minmax(0,1fr)_auto] items-start gap-x-4 px-8 pt-7 pb-5">
          <div className="grid size-16 place-items-center rounded-2xl bg-accent-subtle text-accent-primary">
            <Layers className="size-7" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-12 font-medium text-tertiary">{title}</p>
            <div className="flex items-start gap-3">
              <div className="w-56 shrink-0">
                <CustomSelect
                  value={value.stageTypeId}
                  onChange={(next: string) => {
                    const nextType = stageTypes.find((item) => item.id === next);
                    setValue((current) => ({
                      ...current,
                      stageTypeId: next,
                      // 名称还没被手改过就跟着类型走
                      name:
                        current.name === "" || current.name === selectedType?.name ? (nextType?.name ?? "") : current.name,
                    }));
                  }}
                  disabled={typeLocked}
                  customButton={
                    <SelectButton
                      label={selectedType ? `${selectedType.code} · ${selectedType.name}` : undefined}
                      placeholder={t(`${I18N}.stage_type`)}
                      disabled={typeLocked}
                    />
                  }
                  customButtonClassName="w-full"
                  maxHeight="lg"
                >
                  {stageTypes.map((item) => (
                    <CustomSelect.Option key={item.id} value={item.id}>
                      <span className="font-mono text-12 text-tertiary">{item.code}</span>
                      <span className="ml-2">{item.name}</span>
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              </div>
              <input
                ref={nameRef}
                type="text"
                autoComplete="off"
                value={value.name}
                maxLength={255}
                placeholder={selectedType?.name ?? t(`${I18N}.name_placeholder`)}
                onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))}
                className="block min-w-0 flex-1 border-0 border-b-2 border-transparent bg-transparent px-0 py-1 text-[22px] leading-tight font-semibold tracking-tight text-primary outline-none placeholder:font-medium placeholder:text-placeholder focus:border-accent-strong"
              />
            </div>
            <p className={styles.hint}>{typeLocked ? t(`${I18N}.type_locked_hint`) : t(`${I18N}.name_hint`)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label={t("close")}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div data-modal-wheel-scroll className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-8">
          <FormFieldGroup title={t(`${I18N}.group_hierarchy`)}>
            <div className={getFormGridClassName("grouped-modal")}>
              <FormFieldShell
                label={t(`${I18N}.parent`)}
                required={false}
                editable={!parentLocked}
                styles={styles}
                hint={parentLocked && editing ? t(`${I18N}.parent_locked_hint`) : undefined}
              >
                <CustomSelect
                  value={value.parentId ?? ""}
                  onChange={(next: string) => setValue((current) => ({ ...current, parentId: next || null }))}
                  disabled={parentLocked}
                  customButton={
                    <SelectButton
                      label={parent ? parent.name : t(`${I18N}.parent_root`)}
                      placeholder={t(`${I18N}.parent_root`)}
                      disabled={parentLocked}
                    />
                  }
                  customButtonClassName="w-full"
                  maxHeight="lg"
                >
                  <CustomSelect.Option value="">{t(`${I18N}.parent_root`)}</CustomSelect.Option>
                  {parentCandidates.map((stage) => (
                    <CustomSelect.Option key={stage.id} value={stage.id}>
                      {stage.name}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              </FormFieldShell>
              <FormFieldShell label={t(`${I18N}.milestone`)} required={false} editable styles={styles}>
                <div className={cn(styles.control, "flex items-center gap-3")}>
                  <ToggleSwitch
                    value={value.isMilestone}
                    onChange={() => setValue((current) => ({ ...current, isMilestone: !current.isMilestone }))}
                    size="sm"
                  />
                  <span className="text-14 text-secondary">
                    {t(value.isMilestone ? `${I18N}.milestone_on` : `${I18N}.milestone_off`)}
                  </span>
                </div>
              </FormFieldShell>
            </div>
          </FormFieldGroup>

          <FormFieldGroup title={t(`${I18N}.group_schedule`)} optional>
            <div className="flex items-center gap-3">
              <FormFieldShell label={t(`${I18N}.start_date`)} labelHidden required={false} editable styles={styles} className="flex-1">
                <div className={styles.control}>
                  <DateDropdown
                    value={value.startDate}
                    onChange={(next) =>
                      setValue((current) => ({ ...current, startDate: next ? renderFormattedPayloadDate(next) : null }))
                    }
                    placeholder={t(`${I18N}.start_date`)}
                    buttonVariant="border-with-text"
                    className="h-full w-full"
                    buttonContainerClassName="h-full w-full"
                    buttonClassName={styles.dropdownButton}
                    labelClassName={styles.dropdownLabel}
                    optionsClassName="z-[50]"
                    minDate={getDate(parent?.start_date ?? undefined)}
                    maxDate={getDate(value.endDate ?? parent?.end_date ?? undefined)}
                    formatToken="yyyy-MM-dd"
                  />
                </div>
              </FormFieldShell>
              <span className="text-13 text-placeholder">→</span>
              <FormFieldShell label={t(`${I18N}.end_date`)} labelHidden required={false} editable styles={styles} className="flex-1">
                <div className={styles.control}>
                  <DateDropdown
                    value={value.endDate}
                    onChange={(next) =>
                      setValue((current) => ({ ...current, endDate: next ? renderFormattedPayloadDate(next) : null }))
                    }
                    placeholder={t(`${I18N}.end_date`)}
                    buttonVariant="border-with-text"
                    className="h-full w-full"
                    buttonContainerClassName="h-full w-full"
                    buttonClassName={styles.dropdownButton}
                    labelClassName={styles.dropdownLabel}
                    optionsClassName="z-[50]"
                    minDate={getDate(value.startDate ?? parent?.start_date ?? undefined)}
                    maxDate={getDate(parent?.end_date ?? undefined)}
                    formatToken="yyyy-MM-dd"
                  />
                </div>
              </FormFieldShell>
            </div>
            {parent && (parent.start_date || parent.end_date) && (
              <p className={styles.hint}>
                {t(`${I18N}.schedule_hint`, { start: parent.start_date ?? "…", end: parent.end_date ?? "…" })}
              </p>
            )}
          </FormFieldGroup>

          <FormFieldGroup title={t(`${I18N}.group_owner`)}>
            <div className={getFormGridClassName("grouped-modal")}>
              <FormFieldShell label={t(`${I18N}.owner`)} required={false} editable styles={styles}>
                <div className={styles.control}>
                  <MemberDropdown
                    multiple={false}
                    projectId={projectId}
                    value={value.ownerId}
                    onChange={(next) => setValue((current) => ({ ...current, ownerId: next ?? null }))}
                    buttonVariant="border-with-text"
                    className="h-full w-full"
                    buttonContainerClassName="h-full w-full"
                    buttonClassName={styles.dropdownButton}
                    labelClassName={styles.dropdownLabel}
                    placeholder={t(`${I18N}.owner_placeholder`)}
                    showUserDetails
                    optionsClassName="z-[50]"
                  />
                </div>
              </FormFieldShell>
              <FormFieldShell
                label={t(`${I18N}.ratio`)}
                required={false}
                editable={!hasChildren}
                styles={styles}
                error={isRatioInvalid ? t(`${I18N}.ratio_over_limit`, { remaining: Math.max(0, remaining) }) : undefined}
                hint={
                  hasChildren
                    ? t(`${I18N}.ratio_parent_hint`, { value: Number(editing?.computed_workload_ratio ?? 0) })
                    : inheritedRatio !== null && value.workloadRatio.trim() === ""
                      ? t(`${I18N}.ratio_inherit_hint`, { value: inheritedRatio })
                      : t(`${I18N}.ratio_hint`, { remaining: Math.max(0, remaining) })
                }
              >
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    disabled={hasChildren}
                    value={value.workloadRatio}
                    placeholder={inheritedRatio !== null ? String(inheritedRatio) : ""}
                    onChange={(event) => setValue((current) => ({ ...current, workloadRatio: event.target.value }))}
                    className={cn(
                      styles.input,
                      "bg-surface-1 px-3 pr-9 outline-none focus:border-accent-strong",
                      isRatioInvalid && "!border-danger-strong",
                      hasChildren && "cursor-not-allowed bg-layer-1 text-tertiary"
                    )}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-13 text-tertiary">
                    %
                  </span>
                </div>
              </FormFieldShell>
            </div>
          </FormFieldGroup>

          <FormFieldGroup title={t(`${I18N}.group_description`)} optional>
            <TextArea
              value={value.description}
              onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))}
              placeholder={t(`${I18N}.description_placeholder`)}
              className="!h-24 rounded-lg border !border-subtle-1 text-14"
            />
          </FormFieldGroup>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-subtle px-8 py-4">
          {error && <p className="mr-auto text-12 text-danger-primary">{error}</p>}
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting} disabled={isRatioInvalid}>
            {t(editing ? `${I18N}.save` : `${I18N}.create`)}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
};
