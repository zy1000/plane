import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { DictionaryColorPicker } from "./dictionary-color-picker";
import { ITEM_ROW_GRID } from "./dictionary-items-grid";
import { getDataDictionaryFieldErrorI18nKey } from "./helpers";

export type TDictionaryItemFormValue = { label: string; color: string };

type Props = {
  mode: "create" | "edit";
  /** 编辑态显示的行号 */
  rowNumber?: number;
  initialLabel: string;
  initialColor: string;
  /** 字典开了「彩色显示」才给色板 */
  showColor: boolean;
  /** 本地重名预检（编辑态由调用方排除自己） */
  isLabelTaken: (label: string) => boolean;
  onSubmit: (value: TDictionaryItemFormValue) => Promise<unknown>;
  onCancel: () => void;
  /** 变化时重新聚焦（再次点「添加值」而新增行已打开） */
  focusToken?: number;
};

const I18N = "workspace_settings.settings.data_dictionaries";

/**
 * 编辑态与新增行共用的行内表单。Enter 保存、Esc 取消；**blur 不做任何事**：
 * 色板是 Portal，点色点会让 input 失焦，靠 blur 提交会把用户的选色打断。
 */
export function DictionaryItemForm(props: Props) {
  const { mode, rowNumber, initialLabel, initialColor, showColor, isLabelTaken, onSubmit, onCancel, focusToken } = props;
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initialLabel);
  const [draftColor, setDraftColor] = useState(initialColor);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (mode === "edit") input.select();
  }, [mode, focusToken]);

  const submit = async () => {
    const label = draft.trim();
    if (!label) {
      setError(t(`${I18N}.errors.label_required`));
      return;
    }
    if (isLabelTaken(label)) {
      setError(t(`${I18N}.errors.item_already_exists`));
      return;
    }
    if (mode === "edit" && label === initialLabel && draftColor === initialColor) {
      onCancel();
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({ label, color: draftColor });
      if (mode === "create") {
        // 连续录入：清空后保持打开
        setDraft("");
        setDraftColor("");
        inputRef.current?.focus();
      }
    } catch (requestError) {
      // 字段级错误就地显示并留在编辑态；其它错误 root 已 toast
      const i18nKey = getDataDictionaryFieldErrorI18nKey(requestError);
      if (i18nKey) setError(t(i18nKey));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn(ITEM_ROW_GRID, "min-h-12 border-b border-subtle bg-accent-primary/5 py-1.5")}>
      <span />
      <span className="text-12 tabular-nums text-tertiary">
        {mode === "edit" ? rowNumber : <Plus className="size-3.5 text-accent-primary" />}
      </span>
      <div className="col-span-4 flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          {showColor && (
            <DictionaryColorPicker value={draftColor} onChange={setDraftColor} previewLabel={draft.trim() || undefined} />
          )}
          <input
            ref={inputRef}
            value={draft}
            maxLength={255}
            placeholder={t(`${I18N}.detail.add_value_placeholder`)}
            disabled={isSaving}
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }
            }}
            className={cn(
              "h-8 min-w-0 flex-1 rounded-md border bg-surface-1 px-2.5 text-13 text-primary outline-none focus:border-accent-strong",
              error ? "border-danger-strong" : "border-subtle"
            )}
            aria-label={t(`${I18N}.table.col_value`)}
          />
          <Button variant="primary" size="sm" onClick={() => void submit()} loading={isSaving}>
            {mode === "edit" ? t("save") : t(`${I18N}.detail.add_value`)}
          </Button>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={isSaving}>
            {t("cancel")}
          </Button>
        </div>
        {error && <p className="text-10 leading-4 text-danger-primary">{error}</p>}
      </div>
    </div>
  );
}
