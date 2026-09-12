import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";

/**
 * 裁剪原因的就地编辑气泡。
 *
 * 挂到 body 上再用 popper 贴着格子定位 —— 矩阵是可横滚、可纵滚的表格，气泡留在格子里会被
 * 表格的 overflow 裁掉（最后一行、最右一列尤其明显）。
 *
 * 顶上写清楚是哪个产品的哪条评审；下面给本表已经写过的原因当快捷选项，同一个理由不必一格
 * 一格重敲。Ctrl/Cmd + Enter 保存，纯 Enter 留给换行。
 */
export const CellReasonPopover = ({
  anchor,
  value,
  subject,
  suggestions,
  editable,
  onSave,
  onClose,
}: {
  anchor: HTMLElement;
  value: string;
  /** 「产品 · 评审」 */
  subject: string;
  suggestions: string[];
  editable: boolean;
  onSave: (reason: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { styles, attributes } = usePopper(anchor, popperElement, {
    placement: "bottom-start",
    modifiers: [
      { name: "offset", options: { offset: [0, 6] } },
      { name: "preventOverflow", options: { padding: 12 } },
      { name: "flip", options: { fallbackPlacements: ["top-start", "bottom-end", "top-end"] } },
    ],
  });

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popperElement?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [popperElement, anchor, onClose]);

  const save = (reason: string) => {
    onSave(reason.trim());
    onClose();
  };

  const quickPicks = suggestions.filter((entry) => entry !== draft.trim()).slice(0, 4);

  return createPortal(
    <div
      ref={setPopperElement}
      style={styles.popper}
      {...attributes.popper}
      className="z-50 flex w-80 flex-col gap-2.5 rounded-lg border border-subtle bg-surface-1 p-3.5 shadow-raised-200"
    >
      <div className="min-w-0">
        <p className="text-13 font-medium text-primary">{t("review_tailoring.matrix.reason")}</p>
        <p className="truncate text-12 text-placeholder" title={subject}>
          {subject}
        </p>
      </div>
      <textarea
        ref={textareaRef}
        id="review-tailoring-cell-reason"
        autoFocus={editable}
        readOnly={!editable}
        value={draft}
        rows={3}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t("review_tailoring.matrix.reason_placeholder")}
        className="w-full resize-none rounded-md border border-subtle bg-surface-1 px-2.5 py-2 text-13 leading-relaxed text-primary outline-none placeholder:text-placeholder focus:border-accent-strong focus:ring-3 focus:ring-accent-primary/15"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && editable) save(draft);
        }}
      />
      {editable && quickPicks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quickPicks.map((entry) => (
            <button
              key={entry}
              type="button"
              title={entry}
              className="max-w-full truncate rounded-full bg-layer-3 px-2.5 py-0.5 text-12 text-secondary hover:bg-layer-3-hover"
              onClick={() => {
                setDraft(entry);
                textareaRef.current?.focus();
              }}
            >
              {entry}
            </button>
          ))}
        </div>
      )}
      {editable && (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-11 text-placeholder">
            <kbd className="rounded border border-subtle px-1 font-sans">Ctrl</kbd>
            <span className="mx-0.5">+</span>
            <kbd className="rounded border border-subtle px-1 font-sans">Enter</kbd>{" "}
            {t("review_tailoring.matrix.reason_save_hint")}
          </span>
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" onClick={() => save(draft)}>
            {t("review_tailoring.matrix.reason_save")}
          </Button>
        </div>
      )}
    </div>,
    document.body
  );
};
