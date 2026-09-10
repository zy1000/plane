import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";

/**
 * 裁剪原因的就地编辑气泡。
 *
 * 用 Portal 之外的绝对定位：矩阵本身是可横滚的表格，气泡跟着格子走比挂到 body 再算
 * 坐标简单得多；代价是它会被表格的 overflow 裁掉，所以气泡固定向左下展开，右侧列
 * 不会顶出容器。
 */
export const CellReasonPopover = ({
  value,
  editable,
  onSave,
  onClose,
}: {
  value: string;
  editable: boolean;
  onSave: (reason: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={cn(
        "absolute top-full right-0 z-[5] mt-1 w-72 rounded-md border border-subtle bg-surface-1 p-2.5 shadow-lg"
      )}
      // 点在气泡里不该触发外面那一格的勾选
      onClick={(event) => event.stopPropagation()}
    >
      <p className="mb-1.5 text-11 font-medium text-secondary">{t("review_tailoring.matrix.reason")}</p>
      <textarea
        autoFocus={editable}
        readOnly={!editable}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t("review_tailoring.matrix.reason_placeholder")}
        rows={3}
        className="focus:border-accent-primary w-full resize-none rounded border border-subtle bg-surface-1 px-2 py-1.5 text-12 text-primary outline-none"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          // Ctrl/Cmd + Enter 保存：纯 Enter 要留给多行输入换行
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && editable) {
            onSave(draft.trim());
            onClose();
          }
        }}
      />
      {editable && (
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onSave(draft.trim());
              onClose();
            }}
          >
            {t("review_tailoring.matrix.reason_save")}
          </Button>
        </div>
      )}
    </div>
  );
};
