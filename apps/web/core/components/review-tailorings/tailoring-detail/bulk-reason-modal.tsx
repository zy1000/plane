import { useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { TailoringModalHeader } from "./modal-header";

export type TBulkReasonScope = "missing" | "visible";

/**
 * 明细里的「批量填写原因」。原来是行内一条小输入框，一次只能写一行 —— 裁剪原因常常要写两三行，
 * 和单格原因一样收进大弹窗：先选范围，再写一次，落到这批格子。
 */
export const BulkReasonModal = ({
  isOpen,
  missingCount,
  visibleCount,
  onApply,
  onClose,
}: {
  isOpen: boolean;
  /** 待补原因的格子数 */
  missingCount: number;
  /** 当前筛选下裁剪掉的格子数（含已经写了原因的，写进去会覆盖） */
  visibleCount: number;
  onApply: (scope: TBulkReasonScope, reason: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [scope, setScope] = useState<TBulkReasonScope>("missing");
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraft("");
    setScope(missingCount > 0 ? "missing" : "visible");
  }, [isOpen, missingCount]);

  const count = scope === "missing" ? missingCount : visibleCount;
  const canApply = Boolean(draft.trim()) && count > 0;

  const apply = () => {
    if (!canApply) return;
    onApply(scope, draft.trim());
    onClose();
  };

  const scopes: { key: TBulkReasonScope; label: string; count: number }[] = [
    { key: "missing", label: t("review_tailoring.items.bulk_scope_missing"), count: missingCount },
    { key: "visible", label: t("review_tailoring.items.bulk_scope_visible"), count: visibleCount },
  ];

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
        title={t("review_tailoring.items.bulk_reason")}
        onClose={onClose}
      />
      <div className="space-y-3 px-6">
        <div className="space-y-1.5">
          <p className="text-12 text-tertiary">{t("review_tailoring.items.bulk_reason_title")}</p>
          <div role="radiogroup" className="flex flex-col gap-1.5">
            {scopes.map((option) => {
              const isActive = option.key === scope;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  disabled={option.count === 0}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-lg border px-3.5 text-13 transition-colors",
                    isActive ? "border-accent-strong bg-accent-subtle text-primary" : "border-subtle text-secondary",
                    option.count === 0 ? "cursor-not-allowed text-placeholder" : "hover:border-strong"
                  )}
                  onClick={() => setScope(option.key)}
                >
                  <span className="min-w-0 flex-1 truncate text-left">{option.label}</span>
                  <span className="shrink-0 text-12 text-tertiary tabular-nums">
                    {t("review_tailoring.items.bulk_scope_count", { count: option.count })}
                  </span>
                </button>
              );
            })}
          </div>
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
          {t("review_tailoring.items.bulk_reason_apply", { count })}
        </Button>
      </div>
    </ModalCore>
  );
};
