import { useTranslation } from "@plane/i18n";
import type { TDataDictionary } from "@plane/types";
import { cn } from "@plane/utils";

type Props = {
  dictionaries: TDataDictionary[];
  selectedId: string | null;
  /** 搜索框在页头，搜索词由 root 持有：新建字典后要清掉，否则新字典被过滤掉却是选中态 */
  search: string;
  onSelect: (dictionaryId: string) => void;
};

const I18N = "workspace_settings.settings.data_dictionaries";

/** 字典目录：贴边窄列，系统 / 自定义两组 + 数量（画法同评审模板库的阶段列表）；搜索与新建在页头 */
export function DictionarySidebar(props: Props) {
  const { dictionaries, selectedId, search, onSelect } = props;
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
    <nav className="vertical-scrollbar scrollbar-sm flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-2.5 py-3.5">
      {groups.length === 0 ? (
        <p className="px-2 py-8 text-center text-12 text-placeholder">
          {t(dictionaries.length === 0 ? `${I18N}.list.empty` : `${I18N}.list.no_match`)}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-px">
            <h4 className="px-2 pb-2 text-12 font-medium text-tertiary">
              {group.title} · {group.list.length}
            </h4>
            {group.list.map((dictionary) => {
              const isSelected = dictionary.id === selectedId;
              return (
                <button
                  key={dictionary.id}
                  type="button"
                  onClick={() => onSelect(dictionary.id)}
                  aria-current={isSelected ? "true" : undefined}
                  className={cn(
                    "flex h-[38px] w-full shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-14 transition-colors",
                    isSelected
                      ? "bg-accent-subtle font-semibold text-primary"
                      : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{dictionary.name}</span>
                  <span className="shrink-0 text-12 font-normal tabular-nums text-tertiary">
                    {dictionary.items.length}
                  </span>
                </button>
              );
            })}
          </div>
        ))
      )}
    </nav>
  );
}
