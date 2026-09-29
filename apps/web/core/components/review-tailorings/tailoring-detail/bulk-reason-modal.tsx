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
 * 批量「填写原因」。范围就是勾中的那些行 —— 不再让人先挑「待补原因 / 当前筛选」，
 * 挑范围这件事交给表格上的勾选和筛选去做。
 *
 * 裁剪原因常常要写两三行，所以和单格原因一样收在大弹窗里，没有行内小输入框。
 */
export const BulkReasonModal = ({
  isOpen,
  selectedLabel,
  selectedCount,
  cutCount,
  overwriteCount,
  onApply,
  onClose,
}: {
  isOpen: boolean;
  /** 「已选 3 行」/「已选 3 条」 */
  selectedLabel: string;
  /** 勾中的格子数：比裁剪项多时说明有保留项被跳过 */
  selectedCount: number;
  /** 其中的裁剪项：真正会被写入的那批 */
  cutCount: number;
  /** 裁剪项里已经有原因的，会被覆盖 */
  overwriteCount: number;
  onApply: (reason: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) setDraft("");
  }, [isOpen]);

  const canApply = Boolean(draft.trim()) && cutCount > 0;

  const apply = () => {
    if (!canApply) return;
    onApply(draft.trim());
    onClose();
  };

  const scope = [
    t("review_tailoring.items.bulk_reason_scope", { count: cutCount }),
    overwriteCount > 0 ? t("review_tailoring.items.bulk_reason_overwrite", { count: overwriteCount }) : "",
    cutCount < selectedCount ? t("review_tailoring.items.bulk_reason_skip") : "",
  ]
    .filter(Boolean)
    .join("；");

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXL}
      initialFocus={textareaRef}
    >
      <TailoringModalHeader title={t("review_tailoring.items.bulk_reason_title")} onClose={onClose} />
      <div className="flex flex-col gap-4.5 px-6 py-5">
        <TailoringFacts
          items={[
            { label: t("review_tailoring.items.bulk_reason_selected"), value: selectedLabel },
            { label: t("review_tailoring.items.bulk_reason_range"), value: scope },
          ]}
        />
        <TailoringField label={t("review_tailoring.matrix.reason")} htmlFor="review-tailoring-bulk-reason" required>
          <textarea
            ref={textareaRef}
            id="review-tailoring-bulk-reason"
            value={draft}
            rows={10}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("review_tailoring.matrix.reason_placeholder")}
            className={MODAL_TEXTAREA}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) apply();
            }}
          />
        </TailoringField>
      </div>
      <TailoringModalFooter hint={t("review_tailoring.matrix.reason_shortcut")}>
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button variant="primary" size="xl" disabled={!canApply} onClick={apply}>
          {t("save")}
        </Button>
      </TailoringModalFooter>
    </ModalCore>
  );
};
