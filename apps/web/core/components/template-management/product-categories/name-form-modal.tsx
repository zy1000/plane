import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { getProductCategoryErrorMessage } from "./helpers";

type Props = {
  isOpen: boolean;
  title: string;
  icon: ReactNode;
  label: string;
  initialValue?: string;
  maxLength: number;
  /** 显示「已输入 / 上限」计数（模块名限 30 字时用） */
  showCounter?: boolean;
  /** 标题右侧的归属标签，如所属分类名 */
  contextTag?: string;
  /** 底部左侧的同步说明，如「将同步修改 2 个标准库」 */
  footerNote?: string;
  submitLabel: string;
  /** 失败时抛出，错误显示在字段下方，弹窗保持打开 */
  onSubmit: (name: string) => Promise<unknown>;
  onClose: () => void;
};

/** 只有一个名称字段的表单弹窗：创建 / 编辑分类、编辑一级模块共用 */
export function NameFormModal(props: Props) {
  const {
    isOpen,
    title,
    icon,
    label,
    initialValue = "",
    maxLength,
    showCounter = false,
    contextTag,
    footerNote,
    submitLabel,
    onSubmit,
    onClose,
  } = props;
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValue(initialValue);
    setError(null);
  }, [isOpen, initialValue]);

  const handleSubmit = async () => {
    const name = value.trim();
    if (!name) {
      setError(t("product_categories.form.name_required"));
      return;
    }
    if (name === initialValue.trim()) {
      onClose();
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(name);
      onClose();
    } catch (submitError) {
      setError(getProductCategoryErrorMessage(submitError, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="flex items-center gap-3 border-b border-subtle px-5 py-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-primary">
            {icon}
          </span>
          <h2 className="min-w-0 flex-1 truncate text-16 font-semibold text-primary">{title}</h2>
          {contextTag && (
            <span className="max-w-40 shrink-0 truncate rounded-md bg-layer-1 px-2 py-0.5 text-12 text-secondary">
              {contextTag}
            </span>
          )}
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
            onClick={onClose}
            aria-label={t("close")}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-5">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-0.5 text-12 font-medium text-secondary">
              {label}
              <span className="text-danger-primary">*</span>
            </span>
            <span className="relative block">
              <input
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  if (error) setError(null);
                }}
                maxLength={maxLength}
                autoFocus
                className={cn(
                  "h-9 w-full rounded-md border bg-surface-1 px-3 text-14 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong",
                  showCounter && "pr-14",
                  error ? "border-danger-primary" : "border-subtle"
                )}
              />
              {showCounter && (
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-12 tabular-nums text-tertiary">
                  {value.trim().length}/{maxLength}
                </span>
              )}
            </span>
            {error && <span className="mt-1.5 block text-12 text-danger-primary">{error}</span>}
          </label>
        </div>
        <div className="flex items-center gap-2 border-t border-subtle px-5 py-3">
          <span className="min-w-0 flex-1 truncate text-12 text-tertiary">{footerNote}</span>
          <Button variant="secondary" size="xl" className="px-3" type="button" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="xl" className="px-3" type="submit" loading={isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
