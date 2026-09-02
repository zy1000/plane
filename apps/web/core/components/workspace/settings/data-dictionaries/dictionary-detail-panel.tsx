import { useState } from "react";
import { BookText, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type {
  TCreateDataDictionaryItemPayload,
  TDataDictionary,
  TDataDictionaryItem,
  TUpdateDataDictionaryItemPayload,
  TUpdateDataDictionaryPayload,
} from "@plane/types";
import { Input, TextArea } from "@plane/ui";
import { DictionaryItemsEditor } from "./dictionary-items-editor";
import { getDataDictionaryFieldErrorI18nKey } from "./helpers";

type Props = {
  dictionary: TDataDictionary | null;
  canEdit: boolean;
  onUpdate: (dictionaryId: string, payload: TUpdateDataDictionaryPayload) => Promise<TDataDictionary>;
  onDelete: (dictionary: TDataDictionary) => void;
  onCreateItem: (dictionaryId: string, payload: TCreateDataDictionaryItemPayload) => Promise<TDataDictionaryItem>;
  onUpdateItem: (
    dictionaryId: string,
    itemId: string,
    payload: TUpdateDataDictionaryItemPayload
  ) => Promise<TDataDictionaryItem>;
  onDeleteItem: (item: TDataDictionaryItem) => void;
  onReorder: (
    dictionaryId: string,
    orderedItems: TDataDictionaryItem[],
    movedItem: TDataDictionaryItem
  ) => Promise<void>;
};

/** 调用方用 key={dictionary.id} 挂载，切换字典时靠重新挂载重置草稿，不用 effect 同步 */
export function DictionaryDetailPanel(props: Props) {
  const { dictionary, canEdit, onUpdate, onDelete, onCreateItem, onUpdateItem, onDeleteItem, onReorder } = props;
  const { t } = useTranslation();
  const [draftName, setDraftName] = useState(dictionary?.name ?? "");
  const [draftDescription, setDraftDescription] = useState(dictionary?.description ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!dictionary) {
    return (
      <div className="flex h-full min-h-60 flex-col items-center justify-center rounded-lg border border-dashed border-subtle px-6 py-12 text-center">
        <span className="grid size-10 place-items-center rounded-lg bg-layer-2 text-secondary">
          <BookText className="size-5" />
        </span>
        <p className="mt-3 text-12 text-secondary">
          {t("workspace_settings.settings.data_dictionaries.detail.empty_selection")}
        </p>
      </div>
    );
  }

  const isDirty = draftName !== dictionary.name || draftDescription !== (dictionary.description ?? "");

  const handleSave = async () => {
    const name = draftName.trim();
    if (!name) {
      setNameError(t("workspace_settings.settings.data_dictionaries.errors.name_required"));
      return;
    }
    setIsSaving(true);
    setNameError(null);
    try {
      const updated = await onUpdate(dictionary.id, { name, description: draftDescription.trim() || null });
      setDraftName(updated.name);
      setDraftDescription(updated.description ?? "");
    } catch (requestError) {
      const i18nKey = getDataDictionaryFieldErrorI18nKey(requestError);
      if (i18nKey) setNameError(t(i18nKey));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-subtle bg-surface-1 p-5">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-12 font-medium text-secondary" htmlFor="data-dictionary-name">
            {t("workspace_settings.settings.data_dictionaries.detail.name_label")}
          </label>
          <Input
            id="data-dictionary-name"
            value={draftName}
            maxLength={255}
            disabled={!canEdit}
            hasError={Boolean(nameError)}
            placeholder={t("workspace_settings.settings.data_dictionaries.detail.name_placeholder")}
            onChange={(event) => {
              setDraftName(event.target.value);
              if (nameError) setNameError(null);
            }}
            className="w-full"
          />
          {nameError && <p className="text-10 leading-4 text-danger-primary">{nameError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-12 font-medium text-secondary" htmlFor="data-dictionary-description">
            {t("workspace_settings.settings.data_dictionaries.detail.description_label")}
          </label>
          <TextArea
            id="data-dictionary-description"
            value={draftDescription}
            maxLength={500}
            rows={3}
            disabled={!canEdit}
            placeholder={t("workspace_settings.settings.data_dictionaries.detail.description_placeholder")}
            onChange={(event) => setDraftDescription(event.target.value)}
            className="w-full resize-none"
          />
        </div>

        {canEdit && (!dictionary.is_system || isDirty) && (
          <div className="flex items-center justify-between gap-3">
            {!dictionary.is_system ? (
              <Button variant="error-outline" size="lg" onClick={() => onDelete(dictionary)}>
                <Trash2 className="size-3.5" />
                {t("workspace_settings.settings.data_dictionaries.detail.delete")}
              </Button>
            ) : (
              <span />
            )}
            {isDirty && (
              <Button variant="primary" size="lg" onClick={() => void handleSave()} loading={isSaving}>
                {t("workspace_settings.settings.data_dictionaries.detail.save")}
              </Button>
            )}
          </div>
        )}
      </section>

      <div className="border-t border-subtle" />

      <DictionaryItemsEditor
        dictionary={dictionary}
        canEdit={canEdit}
        onCreateItem={onCreateItem}
        onUpdateItem={onUpdateItem}
        onDeleteItem={onDeleteItem}
        onToggleColored={(isColored) => onUpdate(dictionary.id, { is_colored: isColored })}
        onReorder={onReorder}
      />
    </div>
  );
}
