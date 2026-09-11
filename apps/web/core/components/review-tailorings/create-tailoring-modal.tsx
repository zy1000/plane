import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TCreateReviewTailoringPayload } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";

/**
 * 新建裁剪表：只要一个标题。
 *
 * 阶段不再是表的属性 —— 纵轴一次铺开全部阶段的模板树；产品也不在这里选 —— 进详情页
 * 「添加产品」逐列加。建表这一步问得越少越好。
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
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setTouched(false);
  }, [isOpen]);

  const titleError = touched && !title.trim();

  const handleSubmit = () => {
    setTouched(true);
    if (!title.trim()) return;
    onSubmit({ title: title.trim() });
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="p-5">
        <h2 className="text-16 font-semibold text-primary">{t("review_tailoring.form.create_title")}</h2>

        <div className="mt-4">
          <p className="mb-1.5 text-body-sm-medium text-primary">
            {t("review_tailoring.form.title_label")}
            <span className="ml-0.5 text-danger-primary">*</span>
          </p>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSubmit();
            }}
            placeholder={t("review_tailoring.form.title_placeholder")}
            className={cn(
              "focus:border-accent-primary h-9 w-full rounded border bg-surface-1 px-2.5 text-13 text-primary outline-none",
              titleError ? "border-danger-primary" : "border-subtle"
            )}
          />
          {titleError ? (
            <p className="mt-1 text-11 text-danger-primary">{t("review_tailoring.form.title_required")}</p>
          ) : (
            <p className="mt-1 text-11 text-tertiary">{t("review_tailoring.form.create_hint")}</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" loading={isSubmitting} disabled={isSubmitting} onClick={handleSubmit}>
            {t("create")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
