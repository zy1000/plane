import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import {
  MODAL_TEXTAREA,
  TailoringFacts,
  TailoringField,
  TailoringModalFooter,
  TailoringModalHeader,
} from "./modal-frame";

/**
 * 裁剪原因编辑弹窗。原因常常要写两三行，所以是大弹窗 + 十行输入框，不做行内小输入框。
 *
 * Ctrl/Cmd + Enter 保存，纯 Enter 留给换行。只读（签批中 / 已生效）时只能看。
 */
export const CellReasonModal = ({
  isOpen,
  value,
  context,
  editable,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  value: string;
  /** 改的是哪一格：评审名、阶段、产品 */
  context?: { title: string; stage: string; product: string };
  editable: boolean;
  onSave: (reason: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(value);
  }, [isOpen, value]);

  const save = () => {
    onSave(draft.trim());
    onClose();
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXL}
      initialFocus={textareaRef}
    >
      <TailoringModalHeader title={t("review_tailoring.matrix.reason")} onClose={onClose} />
      <div className="flex flex-col gap-4.5 px-6 py-5">
        {context && (
          <TailoringFacts
            items={[
              { label: t("review_tailoring.matrix.review_column"), value: context.title },
              { label: t("review_tailoring.matrix.stage_column"), value: context.stage },
              { label: t("review_tailoring.actions.add_axes_col_product"), value: context.product },
            ]}
          />
        )}
        <TailoringField
          label={t("review_tailoring.matrix.reason")}
          htmlFor="review-tailoring-cell-reason"
          required={editable}
        >
          <textarea
            ref={textareaRef}
            id="review-tailoring-cell-reason"
            readOnly={!editable}
            value={draft}
            rows={10}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={editable ? t("review_tailoring.matrix.reason_placeholder") : undefined}
            className={MODAL_TEXTAREA}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && editable) save();
            }}
          />
        </TailoringField>
      </div>
      <TailoringModalFooter hint={editable ? t("review_tailoring.matrix.reason_shortcut") : undefined}>
        {editable ? (
          <>
            <Button variant="secondary" size="xl" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button variant="primary" size="xl" onClick={save}>
              {t("save")}
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="xl" onClick={onClose}>
            {t("close")}
          </Button>
        )}
      </TailoringModalFooter>
    </ModalCore>
  );
};
