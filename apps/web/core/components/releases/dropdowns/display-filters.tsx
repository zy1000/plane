/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type {
  TModuleOrderByOptions,
  TReleaseDisplayFilters,
  TReleaseDisplayPropertyKey,
  TReleaseGroupByOption,
} from "@plane/types";
import { FilterOption } from "@/components/issues/issue-layouts/filters";

type Props = {
  displayFilters: TReleaseDisplayFilters;
  handleDisplayFiltersUpdate: (displayFilters: Partial<TReleaseDisplayFilters>) => void;
};

const GROUP_BY_OPTIONS: { key: TReleaseGroupByOption; labelKey: string }[] = [
  { key: "status", labelKey: "cycle.display.properties.status" },
  { key: "lead", labelKey: "lead" },
  { key: "none", labelKey: "none" },
];

const ORDER_BY_OPTIONS: { key: TModuleOrderByOptions; labelKey: string }[] = [
  { key: "sort_order", labelKey: "project_modules.order_by.manual" },
  { key: "name", labelKey: "project_modules.order_by.name" },
  { key: "progress", labelKey: "project_modules.order_by.progress" },
  { key: "issues_length", labelKey: "project_modules.order_by.issues" },
  { key: "target_date", labelKey: "project_modules.order_by.due_date" },
  { key: "-created_at", labelKey: "project_modules.order_by.created_at" },
];

const DISPLAY_PROPERTY_OPTIONS: { key: TReleaseDisplayPropertyKey; labelKey: string }[] = [
  { key: "status", labelKey: "cycle.display.properties.status" },
  { key: "issue_count", labelKey: "cycle.display.properties.issue_count" },
  { key: "start_date", labelKey: "cycle.display.properties.start_date" },
  { key: "end_date", labelKey: "cycle.display.properties.end_date" },
  { key: "created_by", labelKey: "cycle.display.properties.created_by" },
  { key: "members", labelKey: "cycle.display.properties.members" },
];

export const ReleaseDisplayFiltersSelection = observer(function ReleaseDisplayFiltersSelection(props: Props) {
  const { displayFilters, handleDisplayFiltersUpdate } = props;
  const { t } = useTranslation();

  const displayProperties = displayFilters.display_properties ?? {};

  return (
    <div className="vertical-scrollbar relative scrollbar-sm h-full w-full divide-y divide-subtle-1 overflow-hidden overflow-y-auto px-2.5">
      <div className="py-2">
        <p className="pb-1.5 text-xs font-medium uppercase tracking-wider text-tertiary">
          {t("cycle.display.properties.label")}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {DISPLAY_PROPERTY_OPTIONS.map((property) => {
            const isActive = !!displayProperties[property.key];
            return (
              <button
                key={property.key}
                type="button"
                className={`rounded-sm border px-2 py-0.5 text-11 transition-all ${
                  isActive
                    ? "border-accent-strong bg-accent-primary text-on-color"
                    : "border-subtle hover:bg-layer-1"
                }`}
                onClick={() =>
                  handleDisplayFiltersUpdate({
                    display_properties: { [property.key]: !isActive },
                  })
                }
              >
                {t(property.labelKey)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="py-2">
        <p className="pb-1.5 text-xs font-medium uppercase tracking-wider text-tertiary">{t("common.group_by")}</p>
        <div>
          {GROUP_BY_OPTIONS.map((option) => {
            const isActive = (displayFilters.group_by ?? "status") === option.key;
            return (
              <FilterOption
                key={option.key}
                isChecked={isActive}
                title={t(option.labelKey)}
                multiple={false}
                onClick={() => handleDisplayFiltersUpdate({ group_by: option.key })}
              />
            );
          })}
        </div>
      </div>
      <div className="py-2">
        <p className="pb-1.5 text-xs font-medium uppercase tracking-wider text-tertiary">
          {t("common.order_by.label")}
        </p>
        <div>
          {ORDER_BY_OPTIONS.map((option) => {
            const isActive = (displayFilters.order_by ?? "name") === option.key;
            return (
              <FilterOption
                key={option.key}
                isChecked={isActive}
                title={t(option.labelKey)}
                multiple={false}
                onClick={() => handleDisplayFiltersUpdate({ order_by: option.key })}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});
