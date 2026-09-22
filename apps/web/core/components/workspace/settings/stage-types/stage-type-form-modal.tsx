import { useEffect, useState } from "react";
import { Lock, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TStageType } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";

const I18N = "workspace_settings.settings.stage_types";

export type TStageTypeFormValue = {
  code: string;
  name: string;
  description: string;
};

type Props = {
  isOpen: boolean;
  /** null = 新建 */
  stageType: TStageType | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (value: TStageTypeFormValue) => Promise<unknown>;
};

const EMPTY: TStageTypeFormValue = { code: "", name: "", description: "" };

const INPUT =
  "h-9 w-full rounded-md border border-subtle-1 bg-layer-2 px-3 text-13 text-primary outline-none transition-colors placeholder:text-placeholder focus:border-accent-strong";

/**
 * 新建与编辑共用。预置类型的编码与名称锁死（后端也会拒），表单里直接置灰并标「预置」，
 * 免得人改完提交才知道不行。
 */
export function StageTypeFormModal({ isOpen, stageType, isSubmitting, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState<TStageTypeFormValue>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(stageType);
  const isLocked = Boolean(stageType?.is_system);

  useEffect(() => {
    if (!isOpen) return;
    setValue(
      stageType
        ? { code: stageType.code, name: stageType.name, description: stageType.description ?? "" }
        : EMPTY
    );
    setError(null);
  }, [isOpen, stageType]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = {
      code: value.code.trim(),
      name: value.name.trim(),
      description: value.description.trim(),
    };
    if (!trimmed.code) return setError(t(`${I18N}.errors.code_required`));
    if (!trimmed.name) return setError(t(`${I18N}.errors.name_required`));
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (submitError) {
      const payload = submitError as { code?: string; error?: string; detail?: string } | undefined;
      const knownCode = payload?.code ?? payload?.error;
      const known = knownCode?.startsWith("STAGE_TYPE_") ? t(`${I18N}.errors.${knownCode.toLowerCase()}`) : null;
      setError(known ?? payload?.error ?? payload?.detail ?? t(`${I18N}.errors.generic`));
    }
  };

  const lockBadge = (
    <span className="ml-auto inline-flex items-center gap-1 text-11 font-normal text-tertiary">
      <Lock className="size-3" />
      {t(`${I18N}.form.preset_locked`)}
    </span>
  );

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <h2 className="text-14 font-medium text-primary">
          {t(isEdit ? `${I18N}.form.edit_title` : `${I18N}.form.create_title`)}
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
          <label className="flex items-center gap-1 text-12 font-medium text-secondary" htmlFor="stage-type-code">
            {t(`${I18N}.form.code_label`)}
            {!isLocked && <span className="text-danger-primary">*</span>}
            {isLocked && lockBadge}
          </label>
          <input
            id="stage-type-code"
            className={cn(INPUT, "font-mono", isLocked && "cursor-not-allowed bg-layer-1 text-tertiary")}
            maxLength={64}
            value={value.code}
            readOnly={isLocked}
            disabled={isLocked}
            onChange={(event) => setValue((current) => ({ ...current, code: event.target.value }))}
          />
          {!isLocked && <p className="text-11 leading-4 text-tertiary">{t(`${I18N}.form.code_hint`)}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1 text-12 font-medium text-secondary" htmlFor="stage-type-name">
            {t(`${I18N}.form.name_label`)}
            {!isLocked && <span className="text-danger-primary">*</span>}
            {isLocked && lockBadge}
          </label>
          <input
            id="stage-type-name"
            className={cn(INPUT, isLocked && "cursor-not-allowed bg-layer-1 text-tertiary")}
            maxLength={255}
            value={value.name}
            readOnly={isLocked}
            disabled={isLocked}
            onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-12 font-medium text-secondary" htmlFor="stage-type-description">
            {t(`${I18N}.form.description_label`)}
          </label>
          <textarea
            id="stage-type-description"
            className="min-h-20 w-full resize-none rounded-md border border-subtle-1 bg-layer-2 px-3 py-2 text-13 leading-5 text-primary outline-none transition-colors placeholder:text-placeholder focus:border-accent-strong"
            maxLength={500}
            rows={3}
            placeholder={t(`${I18N}.form.description_placeholder`)}
            value={value.description}
            onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))}
          />
          {isLocked && <p className="text-11 leading-4 text-tertiary">{t(`${I18N}.form.preset_hint`)}</p>}
        </div>

        {error && <p className="text-11 leading-4 text-danger-primary">{error}</p>}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {t(isEdit ? `${I18N}.form.save` : `${I18N}.form.create`)}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
