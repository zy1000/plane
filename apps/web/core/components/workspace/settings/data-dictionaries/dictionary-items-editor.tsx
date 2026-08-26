import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TCreateDataDictionaryItemPayload, TDataDictionary, TDataDictionaryItem } from "@plane/types";
import { Input, Sortable } from "@plane/ui";
import { DictionaryItemRow } from "./dictionary-item-row";
import { getDataDictionaryFieldErrorI18nKey } from "./helpers";

type Props = {
  dictionary: TDataDictionary;
  canEdit: boolean;
  onCreateItem: (dictionaryId: string, payload: TCreateDataDictionaryItemPayload) => Promise<TDataDictionaryItem>;
  onRenameItem: (dictionaryId: string, itemId: string, label: string) => Promise<TDataDictionaryItem>;
  onDeleteItem: (item: TDataDictionaryItem) => void;
  onReorder: (
    dictionaryId: string,
    orderedItems: TDataDictionaryItem[],
    movedItem: TDataDictionaryItem
  ) => Promise<void>;
};

const keyExtractor = (item: TDataDictionaryItem) => item.id;

export function DictionaryItemsEditor(props: Props) {
  const { dictionary, canEdit, onCreateItem, onRenameItem, onDeleteItem, onReorder } = props;
  const { t } = useTranslation();
  const [newLabel, setNewLabel] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleReorder = useCallback(
    (data: TDataDictionaryItem[], movedItem?: TDataDictionaryItem) => {
      if (!movedItem) return;
      void onReorder(dictionary.id, data, movedItem);
    },
    [dictionary.id, onReorder]
  );

  const handleRename = useCallback(
    (item: TDataDictionaryItem, label: string) => onRenameItem(dictionary.id, item.id, label),
    [dictionary.id, onRenameItem]
  );

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) {
      setAddError(t("workspace_settings.settings.data_dictionaries.errors.label_required"));
      return;
    }
    setIsAdding(true);
    setAddError(null);
    try {
      await onCreateItem(dictionary.id, { label });
      setNewLabel("");
    } catch (requestError) {
      const i18nKey = getDataDictionaryFieldErrorI18nKey(requestError);
      if (i18nKey) setAddError(t(i18nKey));
    } finally {
      setIsAdding(false);
    }
  };

  const renderRow = (item: TDataDictionaryItem, index: number) => (
    <DictionaryItemRow
      key={item.id}
      item={item}
      index={index}
      canEdit={canEdit}
      onRename={handleRename}
      onDelete={onDeleteItem}
    />
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-12 font-medium text-primary">
            {t("workspace_settings.settings.data_dictionaries.detail.values_title")}
          </p>
          <p className="mt-0.5 text-10 text-secondary">
            {t("workspace_settings.settings.data_dictionaries.detail.values_description")}
          </p>
        </div>
        <span className="rounded bg-layer-2 px-1.5 py-0.5 text-10 font-medium text-secondary">
          {dictionary.items.length}
        </span>
      </div>

      {dictionary.items.length === 0 ? (
        <p className="rounded-md border border-dashed border-subtle px-3 py-6 text-center text-12 text-placeholder">
          {t("workspace_settings.settings.data_dictionaries.detail.no_values")}
        </p>
      ) : canEdit ? (
        <div className="flex flex-col gap-1">
          <Sortable
            id={`dictionary-items-${dictionary.id}`}
            data={dictionary.items}
            keyExtractor={keyExtractor}
            onChange={handleReorder}
            render={renderRow}
          />
        </div>
      ) : (
        // Sortable 没有 disabled 开关：只读时直接不挂拖拽
        <div className="flex flex-col gap-1">{dictionary.items.map(renderRow)}</div>
      )}

      {canEdit && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Input
              value={newLabel}
              maxLength={255}
              placeholder={t("workspace_settings.settings.data_dictionaries.detail.add_value_placeholder")}
              hasError={Boolean(addError)}
              onChange={(event) => {
                setNewLabel(event.target.value);
                if (addError) setAddError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleAdd();
                }
              }}
              className="h-8 w-full"
            />
            <Button variant="secondary" size="lg" onClick={() => void handleAdd()} loading={isAdding}>
              <Plus className="size-3.5" />
              {t("workspace_settings.settings.data_dictionaries.detail.add_value")}
            </Button>
          </div>
          {addError && <p className="text-10 leading-4 text-danger-primary">{addError}</p>}
        </div>
      )}
    </section>
  );
}
