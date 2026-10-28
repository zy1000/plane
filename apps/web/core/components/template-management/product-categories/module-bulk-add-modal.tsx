import { useEffect, useMemo, useState } from "react";
import { FolderPlus, Plus, Tag, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TProductCategory, TProductCategoryBulkModulesResponse, TProductCategoryModuleSkipReason } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { getProductCategoryErrorMessage, previewBulkModules } from "./helpers";

type Props = {
  isOpen: boolean;
  category: TProductCategory;
  onSubmit: (names: string[]) => Promise<TProductCategoryBulkModulesResponse>;
  onClose: () => void;
};

const REASON_KEY: Record<TProductCategoryModuleSkipReason, string> = {
  exists: "product_categories.bulk.reason_exists",
  duplicate: "product_categories.bulk.reason_duplicate",
  too_long: "product_categories.bulk.reason_too_long",
};

/** 批量添加一级模块：每行一个，下方实时预览将添加 / 跳过（已存在、重复、超过 30 字） */
export function ModuleBulkAddModal({ isOpen, category, onSubmit, onClose }: Props) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRaw("");
    setError(null);
  }, [isOpen]);

  const preview = useMemo(
    () =>
      previewBulkModules(
        raw,
        category.modules.map((module) => module.name)
      ),
    [raw, category.modules]
  );
  const hasInput = preview.toAdd.length > 0 || preview.skipped.length > 0;

  const handleSubmit = async () => {
    if (preview.toAdd.length === 0) return;
    setIsSubmitting(true);
    try {
      await onSubmit(preview.toAdd);
      onClose();
    } catch (submitError) {
      setError(getProductCategoryErrorMessage(submitError, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex items-center gap-3 border-b border-subtle px-5 py-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-primary">
          <FolderPlus className="size-4" />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-16 font-semibold text-primary">{t("product_categories.bulk.title")}</h2>
        <span className="inline-flex max-w-40 shrink-0 items-center gap-1 rounded-md bg-layer-1 px-2 py-0.5 text-12 text-secondary">
          <Tag className="size-3 shrink-0" />
          <span className="truncate">{category.name}</span>
        </span>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
          onClick={onClose}
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-4 px-5 py-5">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-0.5 text-12 font-medium text-secondary">
            {t("product_categories.bulk.label")}
            <span className="text-danger-primary">*</span>
          </span>
          <textarea
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              if (error) setError(null);
            }}
            autoFocus
            rows={6}
            placeholder={t("product_categories.bulk.placeholder")}
            className={cn(
              "w-full resize-none rounded-md border bg-surface-1 px-3 py-2 text-14 leading-[22px] text-primary outline-none placeholder:text-placeholder focus:border-accent-strong",
              error ? "border-danger-primary" : "border-subtle"
            )}
          />
          {error && <span className="mt-1.5 block text-12 text-danger-primary">{error}</span>}
        </label>

        {hasInput && (
          <div className="vertical-scrollbar scrollbar-sm max-h-56 space-y-2.5 overflow-y-auto rounded-lg bg-layer-1 px-3.5 py-3">
            <div className="flex items-center gap-4 text-13">
              <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                <span className="size-[7px] rounded-full bg-accent-primary" />
                {t("product_categories.bulk.will_add", { count: preview.toAdd.length })}
              </span>
              {preview.skipped.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-secondary">
                  <span className="size-[7px] rounded-full border-[1.5px] border-strong-1" />
                  {t("product_categories.bulk.will_skip", { count: preview.skipped.length })}
                </span>
              )}
            </div>
            {preview.toAdd.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {preview.toAdd.map((name) => (
                  <span
                    key={name}
                    className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-accent-subtle bg-surface-1 px-2.5 text-13 text-primary"
                  >
                    <Plus className="size-3 shrink-0 text-accent-primary" strokeWidth={2.25} />
                    <span className="truncate">{name}</span>
                  </span>
                ))}
              </div>
            )}
            {preview.skipped.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {preview.skipped.map((item, index) => (
                  <span
                    key={`${item.reason}-${item.name}-${index}`}
                    className={cn(
                      "inline-flex h-[26px] max-w-full items-center gap-1.5 rounded-md px-2 text-12",
                      item.reason === "too_long"
                        ? "bg-danger-subtle text-danger-primary"
                        : "bg-layer-2 text-tertiary"
                    )}
                  >
                    <span className={cn("max-w-44 truncate", item.reason !== "too_long" && "line-through")}>
                      {item.name}
                    </span>
                    <span className="shrink-0">{t(REASON_KEY[item.reason])}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-subtle px-5 py-3">
        <span className="min-w-0 flex-1 truncate text-12 text-tertiary">
          {category.libraries.length > 0
            ? t("product_categories.bulk.sync_add", { count: category.libraries.length })
            : null}
        </span>
        <Button variant="secondary" size="xl" className="px-3" onClick={onClose} disabled={isSubmitting}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="xl"
          className="px-3"
          onClick={() => void handleSubmit()}
          loading={isSubmitting}
          disabled={preview.toAdd.length === 0}
        >
          {preview.toAdd.length > 0
            ? t("product_categories.bulk.submit", { count: preview.toAdd.length })
            : t("product_categories.bulk.submit_empty")}
        </Button>
      </div>
    </ModalCore>
  );
}
