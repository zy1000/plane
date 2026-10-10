/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { CircleDot, Search, Shapes, SignalHigh, User, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { PriorityIcon, StateGroupIcon } from "@plane/propel/icons";
import type { TIssuePriorities, TStateGroups } from "@plane/types";
import { Avatar, ToggleSwitch } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import type { TMultiFilterOption } from "@/components/common/multi-select-filter-chip";
import { MultiSelectFilterChip } from "@/components/common/multi-select-filter-chip";
import { useMember } from "@/hooks/store/use-member";
import type { TIssueType } from "@/services/project";
import { IssueTypeFilterIcon } from "@/utils/work-item-filters/issue-type-filter-icon";
import type { TWorkItemPicker } from "./use-work-item-picker";
import { WorkItemPickerSortMenu } from "./work-item-picker-sort-menu";

const I18N = "work_item_picker";

const STATE_GROUP_KEYS: TStateGroups[] = ["backlog", "unstarted", "started", "completed", "cancelled"];
const PRIORITY_KEYS: TIssuePriorities[] = ["urgent", "high", "medium", "low", "none"];

export const WorkItemPickerToolbar = observer(function WorkItemPickerToolbar(props: {
  projectId: string;
  issueTypes: TIssueType[];
  picker: TWorkItemPicker;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { projectId, issueTypes, picker, searchInputRef } = props;
  const { t } = useTranslation();
  const {
    getUserDetails,
    project: { getProjectMemberIds },
  } = useMember();
  const memberIds = getProjectMemberIds(projectId, false) ?? [];

  const typeOptions = useMemo(
    (): TMultiFilterOption[] =>
      issueTypes.map((type) => ({
        id: type.id,
        label: type.name,
        icon: <IssueTypeFilterIcon name={type.logo_props?.icon?.name} color={type.logo_props?.icon?.color} />,
      })),
    [issueTypes]
  );
  const stateOptions: TMultiFilterOption[] = STATE_GROUP_KEYS.map((group) => ({
    id: group,
    label: t(`${I18N}.state_groups.${group}`),
    icon: <StateGroupIcon stateGroup={group} />,
  }));
  const priorityOptions: TMultiFilterOption[] = PRIORITY_KEYS.map((priority) => ({
    id: priority,
    label: t(`${I18N}.priorities.${priority}`),
    icon: <PriorityIcon priority={priority} size={14} />,
  }));
  const assigneeOptions: TMultiFilterOption[] = memberIds.flatMap((memberId) => {
    const user = getUserDetails(memberId);
    if (!user) return [];
    return [
      {
        id: memberId,
        label: user.display_name,
        icon: <Avatar name={user.display_name} src={getFileURL(user.avatar_url ?? "")} size="sm" />,
      },
    ];
  });

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 pt-3.5 pb-3 sm:px-7">
      <label className="flex h-8 w-full items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 focus-within:border-accent-strong sm:w-64">
        <Search className="size-3.5 shrink-0 text-placeholder" />
        <input
          ref={searchInputRef}
          value={picker.search}
          aria-label={t(`${I18N}.search_placeholder`)}
          placeholder={t(`${I18N}.search_placeholder`)}
          onChange={(event) => picker.setSearch(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
        />
        {picker.search && (
          <button
            type="button"
            aria-label={t("common.clear")}
            className="grid size-5 shrink-0 place-items-center rounded text-placeholder hover:text-secondary"
            onClick={() => picker.setSearch("")}
          >
            <X className="size-3.5" />
          </button>
        )}
      </label>
      <MultiSelectFilterChip
        icon={Shapes}
        label={t(`${I18N}.filters.type`)}
        options={typeOptions}
        value={picker.filters.typeIds}
        onChange={(value) => picker.setFilter("typeIds", value)}
        searchable={typeOptions.length > 8}
      />
      <MultiSelectFilterChip
        icon={CircleDot}
        label={t(`${I18N}.filters.state`)}
        options={stateOptions}
        value={picker.filters.stateGroups}
        onChange={(value) => picker.setFilter("stateGroups", value)}
        searchable={false}
      />
      <MultiSelectFilterChip
        icon={SignalHigh}
        label={t(`${I18N}.filters.priority`)}
        options={priorityOptions}
        value={picker.filters.priorities}
        onChange={(value) => picker.setFilter("priorities", value)}
        searchable={false}
      />
      <MultiSelectFilterChip
        icon={User}
        label={t(`${I18N}.filters.assignee`)}
        options={assigneeOptions}
        value={picker.filters.assigneeIds}
        onChange={(value) => picker.setFilter("assigneeIds", value)}
      />
      {picker.hasFilters && (
        <button
          type="button"
          className="shrink-0 px-1 text-13 font-medium whitespace-nowrap text-tertiary hover:text-secondary"
          onClick={picker.clearFilters}
        >
          {t(`${I18N}.filters.clear`)}
        </button>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-13 whitespace-nowrap text-secondary">
          <ToggleSwitch value={picker.mine} onChange={() => picker.setMine(!picker.mine)} size="sm" />
          {t(`${I18N}.filters.mine`)}
        </label>
        <span className="h-5 w-px bg-layer-3" />
        <WorkItemPickerSortMenu sort={picker.sort} onChange={picker.setSort} />
      </div>
    </div>
  );
});
