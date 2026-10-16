/**
 * 打基线。
 *
 * 弹窗一打开就先跑一次 dry-run —— 基线只收录**通过过审批**的需求，用户必须在按下确认
 * 之前就知道「会纳入多少条、哪些没纳入、哪些纳入的不是当前内容」，否则打出来的是一份
 * 他以为存在、实际不存在的快照。预览与落库共用服务端同一份判定，数字不会在确认后变。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type {
  TRequirementBaselinePayload,
  TRequirementBaselinePreview,
  TRequirementBaselineScope,
  TRequirementTypeSchema,
} from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { BaselinePreviewCard } from "./create-baseline-preview";

const SCOPES: TRequirementBaselineScope[] = ["all", "by_type"];

/** 左栏输入框：40px 高、8px 圆角、14 号字 */
const INPUT_CLASS =
  "block w-full rounded-lg border border-subtle-1 bg-layer-2 px-3 text-14 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong";

type TProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  requirementTypes: TRequirementTypeSchema[];
  onPreview: (payload: TRequirementBaselinePayload) => Promise<TRequirementBaselinePreview>;
  onClose: () => void;
  onSubmit: (payload: TRequirementBaselinePayload) => void;
};

export function CreateBaselineModal(props: TProps) {
  const { isOpen, isSubmitting, requirementTypes, onPreview, onClose, onSubmit } = props;
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<TRequirementBaselineScope>("all");
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<TRequirementBaselinePreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setDescription("");
    setScope("all");
    setTypeIds([]);
    setPreview(null);
  }, [isOpen]);

  const scopePayload = useMemo<TRequirementBaselinePayload>(
    () => (scope === "by_type" ? { scope, requirement_type_ids: typeIds } : { scope: "all" }),
    [scope, typeIds]
  );
  /** 按类型收录时一个都没选 —— 服务端会 400，本地先停住免得白跑一次 */
  const isScopeIncomplete = scope === "by_type" && typeIds.length === 0;

  const runPreview = useCallback(async () => {
    if (isScopeIncomplete) {
      setPreview(null);
      return;
    }
    setIsPreviewLoading(true);
    try {
      setPreview(await onPreview(scopePayload));
    } catch {
      setPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [isScopeIncomplete, onPreview, scopePayload]);

  useEffect(() => {
    if (!isOpen) return;
    void runPreview();
  }, [isOpen, runPreview]);

  const toggleType = (typeId: string) =>
    setTypeIds((current) =>
      current.includes(typeId) ? current.filter((item) => item !== typeId) : [...current, typeId]
    );

  const canSubmit = Boolean(name.trim()) && !isScopeIncomplete && (preview?.entry_count ?? 0) > 0;

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXL}
      className="sm:max-w-[640px]"
    >
      <div className="flex max-h-[90vh] min-h-0 flex-col">
        <div className="flex shrink-0 items-start gap-3 rounded-t-lg border-b border-subtle px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-16 leading-6 font-semibold text-primary">
              {t("workspace_products.requirements.baseline.form.title")}
            </h2>
            <p className="mt-0.5 text-13 text-tertiary">{t("workspace_products.requirements.baseline.form.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
          >
            <X className="size-4" />
          </button>
        </div>

        <div
          data-modal-wheel-scroll
          className="scrollbar-sm vertical-scrollbar flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5"
        >
          <div>
            <label htmlFor="baseline-name" className="mb-2 flex items-center text-13 leading-5 font-medium text-primary">
              {t("workspace_products.requirements.baseline.form.name")}
              <span className="ml-0.5 text-danger-primary">*</span>
            </label>
            <input
              id="baseline-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
              autoFocus
              placeholder={t("workspace_products.requirements.baseline.form.name_placeholder")}
              className={cn(INPUT_CLASS, "h-10")}
            />
          </div>

          <div>
            <label
              htmlFor="baseline-description"
              className="mb-2 flex items-center text-13 leading-5 font-medium text-primary"
            >
              {t("workspace_products.requirements.baseline.form.summary")}
              <span className="ml-1.5 font-normal text-tertiary">{t("requirement_grid.data.optional")}</span>
            </label>
            <textarea
              id="baseline-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={t("workspace_products.requirements.baseline.form.summary_placeholder")}
              className={cn(INPUT_CLASS, "resize-none py-2 leading-[22px]")}
            />
          </div>

          {requirementTypes.length > 1 && (
            <div>
              <p className="mb-2 text-13 leading-5 font-medium text-primary">
                {t("workspace_products.requirements.baseline.form.scope.label")}
              </p>
              <div role="radiogroup" className="inline-flex gap-0.5 rounded-[9px] bg-layer-3 p-0.75">
                {SCOPES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={scope === value}
                    onClick={() => setScope(value)}
                    className={cn(
                      "h-7.5 rounded-md px-3.5 text-13 font-medium transition-colors",
                      scope === value
                        ? "bg-surface-1 text-primary shadow-raised-100"
                        : "text-secondary hover:text-primary"
                    )}
                  >
                    {t(`workspace_products.requirements.baseline.form.scope.${value}`)}
                  </button>
                ))}
              </div>
              {scope === "by_type" && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {requirementTypes.map((requirementType) => {
                    const isSelected = typeIds.includes(requirementType.id);
                    return (
                      <button
                        key={requirementType.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleType(requirementType.id)}
                        className={cn(
                          "h-7 rounded-full border px-3 text-13 transition-colors",
                          isSelected
                            ? "border-accent-strong bg-accent-subtle text-accent-primary"
                            : "border-subtle-1 text-secondary hover:text-primary"
                        )}
                      >
                        {requirementType.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <BaselinePreviewCard preview={preview} isLoading={isPreviewLoading} />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 rounded-b-lg border-t border-subtle px-6 py-3.5">
          <Button variant="secondary" size="xl" disabled={isSubmitting} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="xl"
            loading={isSubmitting}
            disabled={!canSubmit}
            onClick={() => onSubmit({ ...scopePayload, name: name.trim(), description: description.trim() })}
          >
            {t("workspace_products.requirements.baseline.form.confirm")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
