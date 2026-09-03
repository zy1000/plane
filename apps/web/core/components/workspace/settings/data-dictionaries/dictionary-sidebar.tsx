import { Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { SearchIcon } from "@plane/propel/icons";
import type { TDataDictionary } from "@plane/types";
import { cn } from "@plane/utils";

type Props = {
  dictionaries: TDataDictionary[];
  selectedId: string | null;
  canEdit: boolean;
  /** 搜索词由 root 持有：新建字典后要清掉，否则新字典被过滤掉却是选中态 */
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (dictionaryId: string) => void;
  onCreate: () => void;
};

const I18N = "workspace_settings.settings.data_dictionaries";

/** 左栏字典目录：搜索 + 系统 / 自定义两组 + 数量 + 新建 */
export function DictionarySidebar(props: Props) {
  const { dictionaries, selectedId, canEdit, search, onSearchChange, onSelect, onCreate } = props;
  const { t } = useTranslation();
  const query = search.trim().toLowerCase();
  const matches = query
    ? dictionaries.filter((dictionary) => dictionary.name.toLowerCase().includes(query) || dictionary.key.includes(query))
    : dictionaries;
  const groups = [
    { key: "system", title: t(`${I18N}.list.system_group`), list: matches.filter((dictionary) => dictionary.is_system) },
    { key: "custom", title: t(`${I18N}.list.custom_group`), list: matches.filter((dictionary) => !dictionary.is_system) },
  ].filter((group) => group.list.length > 0);

  return (
    <nav className="flex h-full min-h-0 flex-col gap-2 rounded-lg border border-subtle bg-surface-1 p-2">
      <div className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5">
        <SearchIcon className="size-3.5 shrink-0 text-placeholder" />
        <input
          className="min-w-0 flex-1 border-none bg-transparent text-13 leading-4 outline-none placeholder:text-placeholder"
          placeholder={t(`${I18N}.list.search_placeholder`)}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {groups.length === 0 ? (
          <p className="px-2 py-8 text-center text-12 text-placeholder">
            {t(dictionaries.length === 0 ? `${I18N}.list.empty` : `${I18N}.list.no_match`)}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-0.5 pb-2">
              <h4 className="flex items-center justify-between px-2.5 pb-1 pt-2 text-11 font-medium text-tertiary">
                {group.title}
                <span className="tabular-nums">{group.list.length}</span>
              </h4>
              {group.list.map((dictionary) => {
                const isSelected = dictionary.id === selectedId;
                return (
                  <button
                    key={dictionary.id}
                    type="button"
                    onClick={() => onSelect(dictionary.id)}
                    className={cn(
                      "flex h-9 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-13 transition-colors",
                      isSelected ? "bg-accent-primary/10 font-medium text-accent-primary" : "text-secondary hover:bg-layer-1-hover"
                    )}
                  >
                    <span className="truncate">{dictionary.name}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 text-11 tabular-nums",
                        isSelected ? "bg-accent-primary/15 text-accent-primary" : "text-tertiary"
                      )}
                    >
                      {dictionary.items.length}
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={onCreate}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-subtle text-12 font-medium text-accent-primary transition-colors hover:bg-layer-1-hover"
        >
          <Plus className="size-3.5" />
          {t(`${I18N}.list.create`)}
        </button>
      )}
    </nav>
  );
}
