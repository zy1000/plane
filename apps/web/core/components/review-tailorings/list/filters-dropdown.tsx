import { useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { getIconButtonStyling } from "@plane/propel/icon-button";
import { CloseIcon, FilterAppliedIcon, FilterIcon, SearchIcon } from "@plane/propel/icons";
import type { TReviewTailoring } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { FilterHeader, FilterOption, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import type { TTailoringListFilters } from "./filters";
import {
  TAILORING_STATUS_ORDER,
  TAILORING_STATUS_TONE,
  buildCreatorOptions,
  countByStatus,
  hasTailoringFilters,
  toggleValue,
} from "./filters";

const OptionTitle = ({ label, count }: { label: string; count: number }) => (
  <span className="flex items-center gap-2">
    <span className="truncate">{label}</span>
    <span className="text-11 text-placeholder tabular-nums">{count}</span>
  </span>
);

/**
 * 页头的过滤按钮 + 面板，照工作项 / 收件箱那套：面板顶部搜索框，下面按「状态」「创建人」
 * 两组勾选，每项带计数。计数与选项都基于全量列表，不随当前筛选变。
 */
export const TailoringFiltersDropdown = ({
  tailorings,
  filters,
  onChange,
}: {
  tailorings: TReviewTailoring[];
  filters: TTailoringListFilters;
  onChange: (next: TTailoringListFilters) => void;
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [showStatus, setShowStatus] = useState(true);
  const [showCreators, setShowCreators] = useState(true);

  const statusCounts = useMemo(() => countByStatus(tailorings), [tailorings]);
  const creators = useMemo(() => buildCreatorOptions(tailorings), [tailorings]);

  const keyword = query.trim().toLowerCase();
  const statusOptions = TAILORING_STATUS_ORDER.filter((status) =>
    t(`review_tailoring.status.${status}`).toLowerCase().includes(keyword)
  );
  const creatorOptions = creators.filter(({ user }) => user.display_name.toLowerCase().includes(keyword));

  const groupTitle = (label: string, selected: number) => (selected > 0 ? `${label} (${selected})` : label);

  return (
    <FiltersDropdown
      placement="bottom-end"
      title=""
      // FiltersDropdown 自己包了一层 <button>，这里只画样子，不能再套一个 button
      menuButton={
        <span className={getIconButtonStyling("secondary", "lg")} title={t("review_tailoring.filters.title")}>
          {hasTailoringFilters(filters) ? <FilterAppliedIcon className="size-4" /> : <FilterIcon className="size-4" />}
        </span>
      }
    >
      <div className="flex h-full w-full flex-col overflow-hidden">
        <div className="bg-surface-1 p-2.5 pb-0">
          <div className="flex items-center gap-1.5 rounded-sm border-[0.5px] border-subtle bg-surface-2 px-1.5 py-1 text-11">
            <SearchIcon className="text-placeholder" width={12} height={12} strokeWidth={2} />
            <input
              id="review-tailoring-filter-search"
              type="text"
              className="w-full bg-surface-2 outline-none placeholder:text-placeholder"
              placeholder={t("review_tailoring.filters.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
            {query !== "" && (
              <button type="button" className="grid place-items-center" onClick={() => setQuery("")}>
                <CloseIcon className="text-tertiary" height={12} width={12} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        <div className="vertical-scrollbar scrollbar-sm h-full w-full divide-y divide-subtle-1 overflow-y-auto px-2.5">
          <div className="py-2">
            <FilterHeader
              title={groupTitle(t("review_tailoring.filters.status"), filters.status.length)}
              isPreviewEnabled={showStatus}
              handleIsPreviewEnabled={() => setShowStatus((value) => !value)}
            />
            {showStatus &&
              (statusOptions.length > 0 ? (
                statusOptions.map((status) => (
                  <FilterOption
                    key={status}
                    isChecked={filters.status.includes(status)}
                    onClick={() => onChange({ ...filters, status: toggleValue(filters.status, status) })}
                    icon={<span className={cn("size-2 rounded-full bg-current", TAILORING_STATUS_TONE[status])} />}
                    title={<OptionTitle label={t(`review_tailoring.status.${status}`)} count={statusCounts[status]} />}
                  />
                ))
              ) : (
                <p className="p-1.5 text-11 text-placeholder italic">{t("review_tailoring.filters.no_options")}</p>
              ))}
          </div>

          <div className="py-2">
            <FilterHeader
              title={groupTitle(t("review_tailoring.filters.created_by"), filters.createdBy.length)}
              isPreviewEnabled={showCreators}
              handleIsPreviewEnabled={() => setShowCreators((value) => !value)}
            />
            {showCreators &&
              (creatorOptions.length > 0 ? (
                creatorOptions.map(({ user, count }) => (
                  <FilterOption
                    key={user.id}
                    isChecked={filters.createdBy.includes(user.id)}
                    onClick={() => onChange({ ...filters, createdBy: toggleValue(filters.createdBy, user.id) })}
                    icon={
                      <Avatar
                        name={user.display_name}
                        src={getFileURL(user.avatar_url ?? "")}
                        showTooltip={false}
                        size="md"
                      />
                    }
                    title={<OptionTitle label={user.display_name} count={count} />}
                  />
                ))
              ) : (
                <p className="p-1.5 text-11 text-placeholder italic">{t("review_tailoring.filters.no_options")}</p>
              ))}
          </div>
        </div>
      </div>
    </FiltersDropdown>
  );
};
