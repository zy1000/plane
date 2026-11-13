import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Popover } from "@plane/propel/popover";
import type { TDataDictionaryFieldUsage } from "@plane/types";

const I18N = "workspace_settings.settings.data_dictionaries";
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-4 px-4";

/**
 * 标题旁的「引用字段 N」：列出把这个字典当选项来源的工作项字段（字段库字段 / 类型私有字段）。
 * 没有字段引用时不渲染；被引用的字典不能删除（头部「删除字典」据此置灰）。
 */
export function DictionaryFieldUsage({ fields }: { fields: TDataDictionaryFieldUsage[] }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  if (fields.length === 0) return null;

  const getOwner = (field: TDataDictionaryFieldUsage) => {
    if (field.source === "library") {
      return field.binding_count
        ? t(`${I18N}.field_usage.owner_library`, { count: field.binding_count })
        : t(`${I18N}.field_usage.owner_library_unbound`);
    }
    const name = field.issue_type_name ?? "";
    return field.project_name
      ? t(`${I18N}.field_usage.owner_type_project`, { name, project: field.project_name })
      : t(`${I18N}.field_usage.owner_type`, { name });
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Button
        type="button"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-accent-primary/10 px-2 text-13 font-medium text-accent-primary outline-none transition-colors hover:bg-accent-primary/15 focus-visible:ring-2 focus-visible:ring-accent-strong"
      >
        {t(`${I18N}.field_usage.trigger`, { count: fields.length })}
        <ChevronDown className={`size-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </Popover.Button>
      <Popover.Panel
        side="bottom"
        align="start"
        sideOffset={6}
        // 层级要给定位层：值表格的表头是 sticky z-10，只给内容层加 z 浮层会被表头盖住
        positionerClassName="z-50"
        className="w-[440px] max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-subtle bg-surface-1 shadow-raised-200"
      >
        <div className={`${ROW_GRID} h-9 border-b border-subtle bg-layer-1 text-12 font-medium text-tertiary`}>
          <span>{t(`${I18N}.field_usage.col_name`)}</span>
          <span>{t(`${I18N}.field_usage.col_owner`)}</span>
        </div>
        <div className="vertical-scrollbar scrollbar-sm max-h-72 overflow-y-auto">
          {fields.map((field) => {
            const owner = getOwner(field);
            return (
              <div key={field.id} className={`${ROW_GRID} h-10 border-b border-subtle text-13 last:border-b-0`}>
                <span className="truncate font-medium text-primary" title={field.name}>
                  {field.name}
                </span>
                <span className="truncate text-secondary" title={owner}>
                  {owner}
                </span>
              </div>
            );
          })}
        </div>
      </Popover.Panel>
    </Popover>
  );
}
