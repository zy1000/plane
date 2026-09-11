import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { AlertCircle, Scissors, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TCreateReviewTailoringPayload } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { TailoringNextSteps } from "./list/next-steps";

const I18N = "review_tailoring.form";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 描述在这里是纯文本框，后端存的是 HTML：按行包成段落 */
const toDescriptionHtml = (text: string) =>
  text
    .split("\n")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

/**
 * 新建裁剪表：标题必填、描述选填，下面亮出建好之后的三步。
 *
 * 阶段不是表的属性 —— 纵轴一次铺开全部阶段的模板树；评审与产品也不在这里选，
 * 进详情页逐个加。建表这一步问得越少越好。
 */
export const CreateTailoringModal = observer(function CreateTailoringModal({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: TCreateReviewTailoringPayload) => void;
}) {
  const { t } = useTranslation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setDescription("");
    setTouched(false);
  }, [isOpen]);

  const titleError = touched && !title.trim();

  const handleSubmit = () => {
    setTouched(true);
    if (!title.trim()) return;
    const text = description.trim();
    onSubmit({ title: title.trim(), ...(text ? { description_html: toDescriptionHtml(text) } : {}) });
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex items-center gap-3.5 px-6 pt-5.5 pb-4.5">
        <span className="grid size-10.5 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent-primary">
          <Scissors className="size-5" />
        </span>
        <h2 className="flex-1 text-18 font-semibold text-primary">{t(`${I18N}.create_title`)}</h2>
        <button
          type="button"
          aria-label={t("cancel")}
          className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-4.5 px-6 pb-1.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="create-tailoring-title" className="text-13 font-medium text-secondary">
            {t(`${I18N}.title_label`)}
            <span className="ml-1 text-danger-primary">*</span>
          </label>
          <input
            id="create-tailoring-title"
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSubmit();
            }}
            placeholder={t(`${I18N}.title_placeholder`)}
            className={cn(
              "h-10 w-full rounded-lg border bg-surface-1 px-3 text-14 text-primary outline-none placeholder:text-placeholder",
              "transition-shadow focus:ring-3",
              titleError
                ? "border-danger-strong focus:ring-danger-primary/10"
                : "border-subtle focus:border-accent-strong focus:ring-accent-primary/15"
            )}
          />
          {titleError && (
            <span className="flex items-center gap-1 text-12 text-danger-primary">
              <AlertCircle className="size-3.5" />
              {t(`${I18N}.title_required`)}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="create-tailoring-description" className="text-13 font-medium text-secondary">
            {t(`${I18N}.description_label`)}
            <span className="ml-1.5 text-12 font-normal text-placeholder">{t(`${I18N}.optional`)}</span>
          </label>
          <textarea
            id="create-tailoring-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={cn(
              "w-full resize-none rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-14 leading-relaxed text-primary outline-none",
              "transition-shadow focus:border-accent-strong focus:ring-3 focus:ring-accent-primary/15"
            )}
          />
        </div>

        <div className="flex flex-col gap-2.5 rounded-lg border border-subtle bg-surface-2 px-3.5 py-3">
          <span className="text-11 font-semibold tracking-wider text-placeholder">
            {t("review_tailoring.steps.heading")}
          </span>
          <TailoringNextSteps highlightFirst />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2.5 px-6 pt-4 pb-5">
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button variant="primary" size="xl" loading={isSubmitting} disabled={isSubmitting} onClick={handleSubmit}>
          {t(`${I18N}.submit`)}
        </Button>
      </div>
    </ModalCore>
  );
});
