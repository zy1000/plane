import { useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { CloseIcon, FilterAppliedIcon, FilterIcon, SearchIcon } from "@plane/propel/icons";
import type { IUserLite, TRequirementStatus } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { FilterHeader, FilterOption, FiltersDropdown } from "@/components/issues/issue-layouts/filters";

const REQUIREMENT_STATUSES: TRequirementStatus[] = ["draft", "in_review", "published", "changing"];

type TProductRequirementFiltersProps = {
  statusFilters: TRequirementStatus[];
  ownerFilters: string[];
  ownerOptions: IUserLite[];
  onStatusFiltersChange: (value: TRequirementStatus[]) => void;
  onOwnerFiltersChange: (value: string[]) => void;
};

const toggleValue = <T,>(values: T[], value: T) =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

export function ProductRequirementFilters(props: TProductRequirementFiltersProps) {
  const { statusFilters, ownerFilters, ownerOptions, onStatusFiltersChange, onOwnerFiltersChange } = props;
  const { t } = useTranslation();
  const [filtersSearchQuery, setFiltersSearchQuery] = useState("");
  const [statusPreviewEnabled, setStatusPreviewEnabled] = useState(true);
  const [ownerPreviewEnabled, setOwnerPreviewEnabled] = useState(true);

  const hasActiveFilters = statusFilters.length > 0 || ownerFilters.length > 0;
  const normalizedQuery = filtersSearchQuery.trim().toLocaleLowerCase();
  const TriggerIcon = hasActiveFilters ? FilterAppliedIcon : FilterIcon;

  const filteredStatuses = useMemo(
    () =>
      REQUIREMENT_STATUSES.filter((status) =>
        t(`workspace_products.requirements.status.${status}`).toLocaleLowerCase().includes(normalizedQuery)
      ),
    [normalizedQuery, t]
  );

  const filteredOwners = useMemo(
    () =>
      ownerOptions.filter((owner) => {
        const haystack = `${owner.display_name ?? ""} ${owner.first_name ?? ""} ${owner.last_name ?? ""}`
          .toLocaleLowerCase()
          .trim();
        return !normalizedQuery || haystack.includes(normalizedQuery);
      }),
    [normalizedQuery, ownerOptions]
  );

  return (
    <FiltersDropdown
      placement="bottom-end"
      isFiltersApplied={hasActiveFilters}
      menuButton={
        <div
          aria-label={t("common.filters")}
          className={cn(
            "grid size-7 place-items-center rounded-md border border-subtle-1 bg-layer-2 text-secondary transition-all duration-200",
            {
              "border-accent-subtle-1 bg-accent-subtle text-accent-primary": hasActiveFilters,
            }
          )}
        >
          <TriggerIcon
            className={cn("size-3.5", {
              "text-accent-primary [&_path]:fill-current": hasActiveFilters,
            })}
          />
        </div>
      }
    >
      <div className="flex max-h-[350px] flex-col overflow-hidden">
        <div className="bg-surface-1 p-2.5 pb-0">
          <div className="flex items-center gap-1.5 rounded-sm border-[0.5px] border-subtle bg-surface-2 px-1.5 py-1 text-11">
            <SearchIcon className="text-placeholder" width={12} height={12} strokeWidth={2} />
            <input
              type="text"
              className="w-full bg-surface-2 outline-none placeholder:text-placeholder"
              placeholder={t("common.search.label")}
              value={filtersSearchQuery}
              onChange={(event) => setFiltersSearchQuery(event.target.value)}
            />
            {filtersSearchQuery !== "" && (
              <button type="button" className="grid place-items-center" onClick={() => setFiltersSearchQuery("")}>
                <CloseIcon className="text-tertiary" height={12} width={12} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
        <div className="vertical-scrollbar scrollbar-sm h-full w-full divide-y divide-subtle-1 overflow-y-auto px-2.5 text-left">
          <div className="py-2">
            <FilterHeader
              title={`${t("workspace_products.requirements.fields.status")}${
                statusFilters.length > 0 ? ` (${statusFilters.length})` : ""
              }`}
              isPreviewEnabled={statusPreviewEnabled}
              handleIsPreviewEnabled={() => setStatusPreviewEnabled((value) => !value)}
            />
            {statusPreviewEnabled && (
              <div>
                {filteredStatuses.length > 0 ? (
                  filteredStatuses.map((status) => (
                    <FilterOption
                      key={status}
                      isChecked={statusFilters.includes(status)}
                      onClick={() => onStatusFiltersChange(toggleValue(statusFilters, status))}
                      title={t(`workspace_products.requirements.status.${status}`)}
                    />
                  ))
                ) : (
                  <p className="fs-10 italic text-placeholder">{t("common.search.no_matching_results")}</p>
                )}
              </div>
            )}
          </div>
          <div className="py-2">
            <FilterHeader
              title={`${t("workspace_products.requirements.fields.owner")}${
                ownerFilters.length > 0 ? ` (${ownerFilters.length})` : ""
              }`}
              isPreviewEnabled={ownerPreviewEnabled}
              handleIsPreviewEnabled={() => setOwnerPreviewEnabled((value) => !value)}
            />
            {ownerPreviewEnabled && (
              <div>
                {filteredOwners.length > 0 ? (
                  filteredOwners.map((owner) => (
                    <FilterOption
                      key={owner.id}
                      isChecked={ownerFilters.includes(owner.id)}
                      onClick={() => onOwnerFiltersChange(toggleValue(ownerFilters, owner.id))}
                      icon={
                        <Avatar name={owner.display_name} src={getFileURL(owner.avatar_url ?? "")} size="sm" />
                      }
                      title={owner.display_name}
                    />
                  ))
                ) : (
                  <p className="fs-10 italic text-placeholder">{t("common.search.no_matching_results")}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </FiltersDropdown>
  );
}
