import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TDevModeStage, TStageType } from "@plane/types";
import { DEV_MODE_MAX_WORKLOAD_RATIO } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { DEV_MODE_I18N, DEV_MODE_INPUT } from "./dev-modes-grid";

export type TDevModeStageFormValue = {
  stageTypeId: string;
  name: string;
  workloadRatio: string;
  standardDays: string;
};

const EMPTY: TDevModeStageFormValue = { stageTypeId: "", name: "", workloadRatio: "", standardDays: "" };

/**
 * 新建与编辑单个阶段。
 *
 * 占比在这里就即时校验（已分配 + 本次 > 100 时红字提示并禁用提交），不等后端回 400 ——
 * 用户填数字的时候就该知道还剩多少。编辑时阶段类型锁死：换类型等于换掉整棵可选评审树，
 * 已勾的节点会全部失配，后端也会拒。
 */
export function DevModeStageFormModal({
  isOpen,
  stage,
  stageTypes,
  /** 不含正在编辑的这一行的已分配合计 */
  allocatedExcludingCurrent,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  /** null = 新建 */
  stage: TDevModeStage | null;
  stageTypes: TStageType[];
  allocatedExcludingCurrent: number;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (value: TDevModeStageFormValue) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<TDevModeStageFormValue>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(stage);
  // 同样按「分」归整，否则 0.1 + 0.2 的浮点误差会让合法输入被判超限
  const remaining = Math.round((DEV_MODE_MAX_WORKLOAD_RATIO - allocatedExcludingCurrent) * 100) / 100;

  useEffect(() => {
    if (!isOpen) return;
    setValue(
      stage
        ? {
            stageTypeId: stage.stage_type_id,
            name: stage.name,
            workloadRatio: stage.workload_ratio === null ? "" : Number(stage.workload_ratio).toString(),
            standardDays: stage.standard_days === null ? "" : String(stage.standard_days),
          }
        : { ...EMPTY, stageTypeId: stageTypes[0]?.id ?? "" }
    );
    setError(null);
  }, [isOpen, stage, stageTypes]);

  const selectedType = useMemo(
    () => stageTypes.find((item) => item.id === value.stageTypeId) ?? null,
    [stageTypes, value.stageTypeId]
  );

  const ratioNumber = value.workloadRatio.trim() === "" ? null : Number(value.workloadRatio);
  const isRatioInvalid =
    ratioNumber !== null &&
    (Number.isNaN(ratioNumber) || ratioNumber < 0 || Math.round(ratioNumber * 100) > Math.round(remaining * 100));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.stageTypeId) return setError(t(`${DEV_MODE_I18N}.errors.stage_type_required`));
    if (isRatioInvalid) return;
    setError(null);
    try {
      // 名称留空时取类型名，与后端默认一致
      await onSubmit({ ...value, name: value.name.trim() || (selectedType?.name ?? "") });
    } catch (submitError) {
      const payload = submitError as
        | { code?: string; error?: string; name?: string[]; workload_ratio?: string[] }
        | undefined;
      const knownCode = payload?.code ?? payload?.name?.[0];
      const known = knownCode?.startsWith("DEV_MODE_") ? t(`${DEV_MODE_I18N}.errors.${knownCode.toLowerCase()}`) : null;
      setError(known ?? payload?.workload_ratio?.[0] ?? payload?.error ?? t(`${DEV_MODE_I18N}.errors.generic`));
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <h2 className="text-14 font-medium text-primary">
          {t(isEdit ? `${DEV_MODE_I18N}.stage_form.edit_title` : `${DEV_MODE_I18N}.stage_form.create_title`)}
        </h2>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover disabled:opacity-50"
          onClick={onClose}
          disabled={isSubmitting}
        >
          <X className="size-4" />
        </button>
      </div>

      <form className="flex flex-col gap-4 px-5 py-5" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1 text-12 font-medium text-secondary" htmlFor="dev-mode-stage-type">
            {t(`${DEV_MODE_I18N}.stage_form.stage_type_label`)}
            <span className="text-danger-primary">*</span>
          </label>
          <select
            id="dev-mode-stage-type"
            className={cn(DEV_MODE_INPUT, isEdit && "cursor-not-allowed bg-layer-1 text-tertiary")}
            value={value.stageTypeId}
            disabled={isEdit}
            onChange={(event) => {
              const nextId = event.target.value;
              const nextType = stageTypes.find((item) => item.id === nextId);
              setValue((current) => ({
                ...current,
                stageTypeId: nextId,
                // 名称还没被手改过就跟着类型走
                name: current.name === selectedType?.name || current.name === "" ? (nextType?.name ?? "") : current.name,
              }));
            }}
          >
            {stageTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
          {isEdit && <p className="text-11 leading-4 text-tertiary">{t(`${DEV_MODE_I18N}.stage_form.type_locked_hint`)}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1 text-12 font-medium text-secondary" htmlFor="dev-mode-stage-name">
            {t(`${DEV_MODE_I18N}.stage_form.name_label`)}
            <span className="text-danger-primary">*</span>
          </label>
          <input
            id="dev-mode-stage-name"
            className={DEV_MODE_INPUT}
            maxLength={255}
            placeholder={selectedType?.name ?? ""}
            value={value.name}
            onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))}
          />
          <p className="text-11 leading-4 text-tertiary">{t(`${DEV_MODE_I18N}.stage_form.name_hint`)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-12 font-medium text-secondary" htmlFor="dev-mode-stage-ratio">
              {t(`${DEV_MODE_I18N}.stage_form.ratio_label`)}
            </label>
            <div className="relative">
              <input
                id="dev-mode-stage-ratio"
                className={cn(DEV_MODE_INPUT, "pr-8", isRatioInvalid && "border-danger-strong")}
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={value.workloadRatio}
                onChange={(event) => setValue((current) => ({ ...current, workloadRatio: event.target.value }))}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-12 text-tertiary">
                %
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-12 font-medium text-secondary" htmlFor="dev-mode-stage-days">
              {t(`${DEV_MODE_I18N}.stage_form.days_label`)}
            </label>
            <div className="relative">
              <input
                id="dev-mode-stage-days"
                className={cn(DEV_MODE_INPUT, "pr-8")}
                type="number"
                min={0}
                step="1"
                value={value.standardDays}
                onChange={(event) => setValue((current) => ({ ...current, standardDays: event.target.value }))}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-12 text-tertiary">
                {t(`${DEV_MODE_I18N}.stage_form.days_unit`)}
              </span>
            </div>
          </div>
        </div>

        {isRatioInvalid ? (
          <p className="text-11 leading-4 text-danger-primary">
            {t(`${DEV_MODE_I18N}.errors.ratio_over_limit`, {
              allocated: allocatedExcludingCurrent,
              remaining: Math.max(0, remaining),
            })}
          </p>
        ) : (
          error && <p className="text-11 leading-4 text-danger-primary">{error}</p>
        )}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting} disabled={isRatioInvalid}>
            {t(isEdit ? `${DEV_MODE_I18N}.stage_form.save` : `${DEV_MODE_I18N}.stage_form.create`)}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
