import { useState } from "react";
import { observer } from "mobx-react";
import { SlidersHorizontal } from "lucide-react";
import { PROJECT_DISPLAY_PROPERTIES, PROJECT_ORDER_BY_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProjectDisplayFilters, TProjectDisplayProperties, TProjectOrderByOptions } from "@plane/types";
import { cn } from "@plane/utils";
import { FilterHeader, FilterOption, FiltersDropdown } from "@/components/issues/issue-layouts/filters";

const I18N = "workspace_projects";

/** 排序面板里选一个键时的默认方向；表头点击可再翻转 */
const DEFAULT_ORDER_DIRECTION: Record<string, "asc" | "desc"> = {
  sort_order: "asc",
  name: "asc",
  created_at: "desc",
  start_date: "asc",
  end_date: "asc",
  members_length: "desc",
};

export const toOrderBy = (key: string, direction: "asc" | "desc"): TProjectOrderByOptions =>
  (direction === "desc" ? `-${key}` : key) as TProjectOrderByOptions;

export const parseOrderBy = (orderBy: TProjectOrderByOptions | undefined) => {
  const value = orderBy ?? "-created_at";
  const isDescending = value.startsWith("-");
  return { key: isDescending ? value.slice(1) : value, direction: isDescending ? ("desc" as const) : ("asc" as const) };
};

type Props = {
  displayFilters: TProjectDisplayFilters;
  displayProperties: TProjectDisplayProperties;
  onDisplayFiltersChange: (patch: TProjectDisplayFilters) => void;
  onDisplayPropertiesChange: (patch: Partial<TProjectDisplayProperties>) => void;
};

/**
 * 项目列表页头的「显示」，照工作项的面板：显示属性 / 排序方式。
 * 「我参与的 / 已归档」的范围开关挪到了页头下方的快捷筛选条（quick-filters/）。
 */
export const ProjectDisplayDropdown = observer(function ProjectDisplayDropdown(props: Props) {
  const { displayFilters, displayProperties, onDisplayFiltersChange, onDisplayPropertiesChange } = props;
  const { t } = useTranslation();
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true);
  const [isOrderOpen, setIsOrderOpen] = useState(true);
  const { key: orderKey } = parseOrderBy(displayFilters.order_by);

  return (
    <FiltersDropdown
      miniIcon={<SlidersHorizontal className="size-3.5" />}
      title={t(`${I18N}.display.label`)}
      placement="bottom-end"
    >
      <div className="vertical-scrollbar relative scrollbar-sm h-full w-full divide-y divide-subtle-1 overflow-hidden overflow-y-auto px-2.5">
        <div className="py-2">
          <FilterHeader
            title={t(`${I18N}.display.properties`)}
            isPreviewEnabled={isPropertiesOpen}
            handleIsPreviewEnabled={() => setIsPropertiesOpen((open) => !open)}
          />
          {isPropertiesOpen && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {PROJECT_DISPLAY_PROPERTIES.map((property) => {
                const isActive = displayProperties[property.key];
                return (
                  <button
                    key={property.key}
                    type="button"
                    className={cn(
                      "rounded-sm border px-2 py-0.5 text-11 transition-all",
                      isActive ? "border-accent-strong bg-accent-primary text-on-color" : "border-subtle hover:bg-layer-1"
                    )}
                    onClick={() => onDisplayPropertiesChange({ [property.key]: !isActive })}
                  >
                    {t(property.i18n_label)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="py-2">
          <FilterHeader
            title={t(`${I18N}.display.order_by`)}
            isPreviewEnabled={isOrderOpen}
            handleIsPreviewEnabled={() => setIsOrderOpen((open) => !open)}
          />
          {isOrderOpen &&
            PROJECT_ORDER_BY_OPTIONS.map((option) => (
              <FilterOption
                key={option.key}
                isChecked={orderKey === option.key}
                title={t(option.i18n_label)}
                multiple={false}
                onClick={() =>
                  onDisplayFiltersChange({ order_by: toOrderBy(option.key, DEFAULT_ORDER_DIRECTION[option.key] ?? "asc") })
                }
              />
            ))}
        </div>
      </div>
    </FiltersDropdown>
  );
});
