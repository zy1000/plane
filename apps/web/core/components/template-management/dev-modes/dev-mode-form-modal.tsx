import { useEffect, useState } from "react";
import { Lock, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TDevMode, TDevModeFeatureKey, TDevModeFeatures } from "@plane/types";
import { DEV_MODE_FEATURE_KEYS } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  getRandomTypeIconOption,
  getTypeIconOption,
  TypeIconPicker,
  type TTypeIconOption,
} from "@/components/common/type-icon-picker";
import { DevModeFeatureToggles } from "./dev-mode-feature-toggles";
import { DEV_MODE_I18N, DEV_MODE_INPUT } from "./dev-modes-grid";

export type TDevModeFormValue = {
  name: string;
  description: string;
  icon: TTypeIconOption;
  features: TDevModeFeatures;
};

const allOn = (): TDevModeFeatures =>
  Object.fromEntries(DEV_MODE_FEATURE_KEYS.map((key) => [key, true])) as TDevModeFeatures;

/**
 * 新建与编辑共用。预置模式的名称锁死（后端也会拒），表单里直接置灰并标「预置」，
 * 免得人改完提交才知道不行 —— 组件开关、描述、图标仍然可改。
 */
export function DevModeFormModal({
  isOpen,
  devMode,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  /** null = 新建 */
  devMode: TDevMode | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (value: TDevModeFormValue) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<TDevModeFormValue>(() => ({
    name: "",
    description: "",
    icon: getRandomTypeIconOption(),
    features: allOn(),
  }));
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(devMode);
  const isNameLocked = Boolean(devMode?.is_system);

  useEffect(() => {
    if (!isOpen) return;
    setValue(
      devMode
        ? {
            name: devMode.name,
            description: devMode.description ?? "",
            icon: getTypeIconOption(devMode.icon_props?.icon),
            features: { ...allOn(), ...devMode.features },
          }
        : { name: "", description: "", icon: getRandomTypeIconOption(), features: allOn() }
    );
    setIsIconPickerOpen(false);
    setError(null);
  }, [isOpen, devMode]);

  const handleFeatureChange = (key: TDevModeFeatureKey, next: boolean) =>
    setValue((current) => ({ ...current, features: { ...current.features, [key]: next } }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = { ...value, name: value.name.trim(), description: value.description.trim() };
    if (!trimmed.name) return setError(t(`${DEV_MODE_I18N}.errors.name_required`));
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (submitError) {
      const payload = submitError as { code?: string; error?: string; name?: string[] } | undefined;
      const knownCode = payload?.code ?? payload?.name?.[0];
      const known = knownCode?.startsWith("DEV_MODE_") ? t(`${DEV_MODE_I18N}.errors.${knownCode.toLowerCase()}`) : null;
      setError(known ?? payload?.error ?? t(`${DEV_MODE_I18N}.errors.generic`));
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <h2 className="text-14 font-medium text-primary">
          {t(isEdit ? `${DEV_MODE_I18N}.form.edit_title` : `${DEV_MODE_I18N}.form.create_title`)}
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
        <div className="flex items-center gap-3">
          <TypeIconPicker
            value={value.icon}
            isOpen={isIconPickerOpen}
            onChange={(icon) => setValue((current) => ({ ...current, icon }))}
            onToggle={setIsIconPickerOpen}
            ariaLabel={t(`${DEV_MODE_I18N}.form.icon_label`)}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label className="flex items-center gap-1 text-12 font-medium text-secondary" htmlFor="dev-mode-name">
              {t(`${DEV_MODE_I18N}.form.name_label`)}
              {!isNameLocked && <span className="text-danger-primary">*</span>}
              {isNameLocked && (
                <span className="ml-auto inline-flex items-center gap-1 text-11 font-normal text-tertiary">
                  <Lock className="size-3" />
                  {t(`${DEV_MODE_I18N}.form.preset_locked`)}
                </span>
              )}
            </label>
            <input
              id="dev-mode-name"
              className={cn(DEV_MODE_INPUT, isNameLocked && "cursor-not-allowed bg-layer-1 text-tertiary")}
              maxLength={255}
              value={value.name}
              readOnly={isNameLocked}
              disabled={isNameLocked}
              onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-12 font-medium text-secondary" htmlFor="dev-mode-description">
            {t(`${DEV_MODE_I18N}.form.description_label`)}
          </label>
          <textarea
            id="dev-mode-description"
            className="min-h-18 w-full resize-none rounded-md border border-subtle-1 bg-layer-2 px-3 py-2 text-13 leading-5 text-primary outline-none transition-colors placeholder:text-placeholder focus:border-accent-strong"
            maxLength={500}
            rows={2}
            placeholder={t(`${DEV_MODE_I18N}.form.description_placeholder`)}
            value={value.description}
            onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1 text-12 font-medium text-secondary">
            {t(`${DEV_MODE_I18N}.form.features_label`)}
            <span className="text-danger-primary">*</span>
          </span>
          <DevModeFeatureToggles
            features={value.features}
            layout="grid"
            disabled={isSubmitting}
            onChange={handleFeatureChange}
          />
          <p className="text-11 leading-4 text-tertiary">{t(`${DEV_MODE_I18N}.form.features_hint`)}</p>
        </div>

        {error && <p className="text-11 leading-4 text-danger-primary">{error}</p>}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {t(isEdit ? `${DEV_MODE_I18N}.form.save` : `${DEV_MODE_I18N}.form.create`)}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
