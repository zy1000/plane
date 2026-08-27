import { Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TDataDictionary } from "@plane/types";
import { cn } from "@plane/utils";

type Props = {
  dictionaries: TDataDictionary[];
  selectedId: string | null;
  canEdit: boolean;
  onSelect: (dictionaryId: string) => void;
  onCreate: () => void;
};

export function DictionaryTypeBadge({ isSystem }: { isSystem: boolean }) {
  const { t } = useTranslation();
  return isSystem ? (
    <span className="inline-flex shrink-0 items-center rounded-full bg-accent-primary/10 px-2 py-0.5 text-10 font-medium text-accent-primary">
      {t("workspace_settings.settings.data_dictionaries.list.system_badge")}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full bg-layer-1 px-2 py-0.5 text-10 font-medium text-tertiary">
      {t("workspace_settings.settings.data_dictionaries.list.custom_badge")}
    </span>
  );
}

export function DictionaryList(props: Props) {
  const { dictionaries, selectedId, canEdit, onSelect, onCreate } = props;
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-subtle bg-surface-1 p-2">
      <p className="px-2 pt-1 text-11 font-medium text-tertiary">
        {t("workspace_settings.settings.data_dictionaries.list.title")}
        <span className="ml-1.5 text-placeholder">({dictionaries.length})</span>
      </p>
      {dictionaries.length === 0 ? (
        <p className="px-2 py-6 text-center text-12 text-placeholder">
          {t("workspace_settings.settings.data_dictionaries.list.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {dictionaries.map((dictionary) => {
            const isSelected = dictionary.id === selectedId;
            return (
              <button
                key={dictionary.id}
                type="button"
                onClick={() => onSelect(dictionary.id)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-md px-2 py-2 text-left transition-colors",
                  isSelected ? "bg-layer-1-hover" : "hover:bg-layer-transparent-hover"
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-13 font-medium text-primary">{dictionary.name}</span>
                  <DictionaryTypeBadge isSystem={dictionary.is_system} />
                </span>
                <span className="text-11 text-tertiary">
                  {t("workspace_settings.settings.data_dictionaries.list.item_count", {
                    count: dictionary.items.length,
                  })}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-subtle text-11 font-medium text-accent-primary transition-colors hover:border-accent-subtle hover:bg-accent-subtle"
        >
          <Plus className="size-3.5" />
          {t("workspace_settings.settings.data_dictionaries.list.create")}
        </button>
      )}
    </div>
  );
}
