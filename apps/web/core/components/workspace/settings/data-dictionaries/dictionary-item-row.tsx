import { useEffect, useState } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TDataDictionaryItem } from "@plane/types";
import { cn } from "@plane/utils";
import { getDataDictionaryFieldErrorI18nKey } from "./helpers";

type Props = {
  item: TDataDictionaryItem;
  index: number;
  canEdit: boolean;
  onRename: (item: TDataDictionaryItem, label: string) => Promise<unknown>;
  onDelete: (item: TDataDictionaryItem) => void;
};

export function DictionaryItemRow(props: Props) {
  const { item, index, canEdit, onRename, onDelete } = props;
  const { t } = useTranslation();
  const [draft, setDraft] = useState(item.label);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(item.label);
    setError(null);
  }, [item.label]);

  const commit = async () => {
    const nextLabel = draft.trim();
    if (!nextLabel) {
      setError(t("workspace_settings.settings.data_dictionaries.errors.label_required"));
      return;
    }
    setError(null);
    if (nextLabel === item.label) {
      setDraft(item.label);
      return;
    }
    try {
      await onRename(item, nextLabel);
    } catch (requestError) {
      const i18nKey = getDataDictionaryFieldErrorI18nKey(requestError);
      if (i18nKey) setError(t(i18nKey));
      else setDraft(item.label);
    }
  };

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded-md border bg-surface-1 p-1.5 focus-within:border-accent-strong",
          error ? "border-danger-strong" : "border-subtle"
        )}
      >
        {canEdit && (
          <GripVertical
            data-sortable-drag-handle
            className="size-3.5 shrink-0 cursor-grab text-placeholder active:cursor-grabbing"
            aria-label={t("workspace_settings.settings.data_dictionaries.detail.drag_hint")}
          />
        )}
        <span className="grid size-5 shrink-0 place-items-center rounded bg-layer-2 text-10 font-medium text-secondary">
          {index + 1}
        </span>
        <input
          value={draft}
          maxLength={255}
          readOnly={!canEdit}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onBlur={() => {
            if (canEdit) void commit();
          }}
          onKeyDown={(event) => {
            if (!canEdit) return;
            if (event.key === "Enter") {
              event.preventDefault();
              // 交给 onBlur 统一提交，避免 Enter + 失焦提交两次
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              setDraft(item.label);
              setError(null);
            }
          }}
          className="h-7 min-w-0 flex-1 bg-transparent px-1 text-12 text-primary outline-none"
        />
        {canEdit && (
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="grid size-7 shrink-0 place-items-center rounded text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger-subtle hover:text-danger-primary focus:opacity-100"
            aria-label={t("workspace_settings.settings.data_dictionaries.detail.delete_value")}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      {error && <p className="mt-1 px-1 text-10 leading-4 text-danger-primary">{error}</p>}
    </div>
  );
}
