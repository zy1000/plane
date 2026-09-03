import { ListPlus, Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import type { TDataDictionaryItemsSort } from "@plane/types";
import { cn } from "@plane/utils";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  sort: TDataDictionaryItemsSort;
  onSortChange: (value: TDataDictionaryItemsSort) => void;
  canEdit: boolean;
  /** 为什么现在不能拖拽（搜索中 / 非手动顺序）；null 表示可以拖 */
  dragDisabledReason: "search" | "sort" | null;
  onAdd: () => void;
  onBulkAdd: () => void;
};

const I18N = "workspace_settings.settings.data_dictionaries";
const SORTS: TDataDictionaryItemsSort[] = ["manual", "name", "recent"];

export function DictionaryItemsToolbar(props: Props) {
  const { search, onSearchChange, sort, onSortChange, canEdit, dragDisabledReason, onAdd, onBulkAdd } = props;
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-8 w-64 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5">
        <SearchIcon className="size-3.5 shrink-0 text-placeholder" />
        <input
          className="min-w-0 flex-1 border-none bg-transparent text-13 leading-4 outline-none placeholder:text-placeholder"
          placeholder={t(`${I18N}.toolbar.search_placeholder`)}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      <div className="flex h-8 items-center gap-0.5 rounded-md border border-subtle bg-surface-1 p-0.5" role="group">
        {SORTS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSortChange(option)}
            className={cn(
              "h-full rounded px-2.5 text-12 whitespace-nowrap transition-colors",
              sort === option ? "bg-layer-2 font-medium text-primary" : "text-secondary hover:text-primary"
            )}
          >
            {t(`${I18N}.toolbar.sort_${option}`)}
          </button>
        ))}
      </div>

      {canEdit && dragDisabledReason && (
        <span className="text-11 text-placeholder">{t(`${I18N}.toolbar.drag_disabled_${dragDisabledReason}`)}</span>
      )}

      <div className="flex-1" />

      {canEdit && (
        <>
          <Button variant="secondary" size="base" prependIcon={<ListPlus />} onClick={onBulkAdd}>
            {t(`${I18N}.toolbar.bulk_add`)}
          </Button>
          <Button variant="primary" size="base" prependIcon={<Plus />} onClick={onAdd}>
            {t(`${I18N}.detail.add_value`)}
          </Button>
        </>
      )}
    </div>
  );
}
