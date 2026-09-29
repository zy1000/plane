import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { EReviewTailoringKind, TUpdateReviewTailoringHeaderPayload } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { descriptionHtmlToText, toDescriptionHtml } from "./description-text";
import {
  MODAL_INPUT,
  MODAL_TEXTAREA,
  TailoringField,
  TailoringModalFooter,
  TailoringModalHeader,
} from "./tailoring-detail/modal-frame";

const I18N = "review_tailoring.form";

export type TEditTailoringTarget = {
  title: string;
  tailoring_kind: EReviewTailoringKind;
  stage_label: string | null;
  /** undefined = 还在取（列表行不带描述，打开时才去拿详情） */
  description_html: string | null | undefined;
};

/**
 * 编辑裁剪表：标题、描述可改；裁剪类型与阶段建表时定下，这里只读。
 *
 * 表头是元数据，不走签批，任何状态都能改 —— 与后端 `update_header` 同一口径。
 * 只把真正变了的字段发出去，没改就直接关掉。
 */
export const EditTailoringModal = ({
  isOpen,
  target,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  target: TEditTailoringTarget | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: TUpdateReviewTailoringHeaderPayload) => void;
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  const isLoadingDescription = target?.description_html === undefined;
  const originalDescription = descriptionHtmlToText(target?.description_html);

  useEffect(() => {
    if (!isOpen || !target) return;
    setTitle(target.title);
    setTouched(false);
    // 依赖只放打开与标题：描述晚到时由下面那个 effect 补
  }, [isOpen, target?.title]);

  useEffect(() => {
    if (isOpen && !isLoadingDescription) setDescription(originalDescription);
  }, [isOpen, isLoadingDescription, originalDescription]);

  const titleError = touched && !title.trim();

  const handleSubmit = () => {
    setTouched(true);
    if (!target || !title.trim() || isLoadingDescription) return;
    const payload: TUpdateReviewTailoringHeaderPayload = {};
    if (title.trim() !== target.title) payload.title = title.trim();
    const text = description.trim();
    if (text !== originalDescription) payload.description_html = text ? toDescriptionHtml(text) : "";
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    onSubmit(payload);
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <TailoringModalHeader title={t(`${I18N}.edit_title`)} onClose={onClose} />

      <div className="flex flex-col gap-4.5 px-6 py-5">
        <TailoringField
          label={t(`${I18N}.title_label`)}
          htmlFor="edit-tailoring-title"
          required
          error={titleError ? t(`${I18N}.title_required`) : undefined}
        >
          <input
            id="edit-tailoring-title"
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSubmit();
            }}
            className={cn(MODAL_INPUT, titleError && "border-danger-strong focus:border-danger-strong")}
          />
        </TailoringField>

        <div className="grid grid-cols-2 gap-4">
          <TailoringField label={t(`${I18N}.kind_label`)} htmlFor="edit-tailoring-kind">
            <input
              id="edit-tailoring-kind"
              disabled
              value={target ? t(`review_tailoring.kind.${target.tailoring_kind}`) : ""}
              className={MODAL_INPUT}
            />
          </TailoringField>
          <TailoringField label={t(`${I18N}.stage_label`)} htmlFor="edit-tailoring-stage">
            <input id="edit-tailoring-stage" disabled value={target?.stage_label ?? "—"} className={MODAL_INPUT} />
          </TailoringField>
          <span className="col-span-2 -mt-2 text-12 text-tertiary">{t(`${I18N}.kind_stage_locked`)}</span>
        </div>

        <TailoringField label={t(`${I18N}.description_label`)} htmlFor="edit-tailoring-description">
          <textarea
            id="edit-tailoring-description"
            rows={5}
            disabled={isLoadingDescription}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={MODAL_TEXTAREA}
          />
        </TailoringField>
      </div>

      <TailoringModalFooter>
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="xl"
          loading={isSubmitting}
          disabled={isSubmitting || isLoadingDescription}
          onClick={handleSubmit}
        >
          {t("save")}
        </Button>
      </TailoringModalFooter>
    </ModalCore>
  );
};
