import { useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { TailoringModalHeader } from "./modal-header";

/**
 * 裁剪原因编辑弹窗。
 *
 * Ctrl/Cmd + Enter 保存，纯 Enter 留给换行。
 */
export const CellReasonModal = ({
  isOpen,
  value,
  editable,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  value: string;
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
      width={EModalWidth.XXL}
      initialFocus={textareaRef}
    >
      <TailoringModalHeader
        icon={<MessageSquare className="size-5" />}
        title={t("review_tailoring.matrix.reason")}
        onClose={onClose}
      />
      <div className="px-6">
        <textarea
          ref={textareaRef}
          id="review-tailoring-cell-reason"
          readOnly={!editable}
          value={draft}
          rows={10}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("review_tailoring.matrix.reason_placeholder")}
          className="min-h-56 w-full resize-y rounded-lg border border-subtle bg-surface-1 px-3 py-2.5 text-14 leading-relaxed text-primary outline-none placeholder:text-placeholder"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && editable) save();
          }}
        />
      </div>
      {editable && (
        <div className="flex items-center justify-end gap-2.5 px-6 pt-4 pb-5">
          <Button variant="secondary" size="xl" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="xl" onClick={save}>
            {t("save")}
          </Button>
        </div>
      )}
      {!editable && <div className="pb-5" />}
    </ModalCore>
  );
};
