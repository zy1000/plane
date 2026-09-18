import { useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { TailoringModalHeader } from "./modal-header";

/**
 * 明细里的「填写原因」。范围就是勾中的那些行 —— 不再让人先挑「待补原因 / 当前筛选」，
 * 挑范围这件事交给表格上的勾选和筛选去做。
 *
 * 裁剪原因常常要写两三行，所以和单格原因一样收在大弹窗里，没有行内小输入框。
 */
export const BulkReasonModal = ({
  isOpen,
  selectedCount,
  cutCount,
  overwriteCount,
  onApply,
  onClose,
}: {
  isOpen: boolean;
  /** 勾中的行数，写在标题下 */
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
        title={t("review_tailoring.items.bulk_reason_title")}
        subtitle={t("review_tailoring.items.selected_count", { count: selectedCount })}
        onClose={onClose}
      />
      <div className="space-y-3 px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-layer-1 px-3.5 py-2.5 text-13 text-secondary">
          <span className="tabular-nums">{t("review_tailoring.items.bulk_reason_scope", { count: cutCount })}</span>
          {overwriteCount > 0 && (
            <span className="tabular-nums text-warning-primary">
              {t("review_tailoring.items.bulk_reason_overwrite", { count: overwriteCount })}
            </span>
          )}
          {cutCount < selectedCount && (
            <span className="ml-auto text-12 text-tertiary">{t("review_tailoring.items.bulk_reason_skip")}</span>
          )}
        </div>

        <textarea
          ref={textareaRef}
          id="review-tailoring-bulk-reason"
          value={draft}
          rows={8}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("review_tailoring.matrix.reason_placeholder")}
          className="min-h-40 w-full resize-y rounded-lg border border-subtle bg-surface-1 px-3 py-2.5 text-14 leading-relaxed text-primary outline-none placeholder:text-placeholder"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) apply();
          }}
        />
      </div>
      <div className="flex items-center gap-2.5 px-6 pt-4 pb-5">
        <span className="mr-auto text-12 text-tertiary">{t("review_tailoring.matrix.reason_shortcut")}</span>
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button variant="primary" size="xl" disabled={!canApply} onClick={apply}>
          {t("review_tailoring.items.bulk_reason_apply", { count: cutCount })}
        </Button>
      </div>
    </ModalCore>
  );
};
