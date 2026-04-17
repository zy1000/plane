/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { FilterOption } from "@/components/issues/issue-layouts/filters";

type TGroupByValue = "state" | "owned_by" | "release" | "none";
type TCycleListDisplayFilters = {
  group_by?: TGroupByValue;
};

type Props = {
  displayFilters: TCycleListDisplayFilters;
  handleDisplayFiltersUpdate: (displayFilters: Partial<TCycleListDisplayFilters>) => void;
};

const GROUP_BY_OPTIONS: { key: TGroupByValue; labelKey: string }[] = [
  { key: "state", labelKey: "state" },
  { key: "owned_by", labelKey: "common.assignee" },
  { key: "release", labelKey: "release.label" },
  { key: "none", labelKey: "none" },
];

export const CycleDisplayFiltersSelection = observer(function CycleDisplayFiltersSelection(props: Props) {
  const { displayFilters, handleDisplayFiltersUpdate } = props;
  const { t } = useTranslation();

  return (
    <div className="vertical-scrollbar relative scrollbar-sm h-full w-full divide-y divide-subtle-1 overflow-hidden overflow-y-auto px-2.5">
      <div className="py-2">
        <p className="pb-1.5 text-xs font-medium uppercase tracking-wider text-tertiary">{t("common.group_by")}</p>
        <div>
          {GROUP_BY_OPTIONS.map((option) => {
            const isActive = (displayFilters.group_by ?? "state") === option.key;
            const label =
              option.key === "release" ? t("release.label", { count: 1 }) : t(option.labelKey);
            return (
              <FilterOption
                key={option.key}
                isChecked={isActive}
                title={label}
                multiple={false}
                onClick={() => handleDisplayFiltersUpdate({ group_by: option.key })}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});
