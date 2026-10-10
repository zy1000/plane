/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ArrowDown, ArrowUp, ExternalLink, Rocket } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CycleIcon, PriorityIcon, StateGroupIcon } from "@plane/propel/icons";
import type { TWorkItemPickerContainer, TWorkItemPickerOrderBy, TWorkItemPickerRow } from "@plane/types";
import { Avatar, Checkbox } from "@plane/ui";
import { cn, generateWorkItemLink, getFileURL, renderFormattedDate } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import type { TIssueType } from "@/services/project";
import { IssueTypeFilterIcon } from "@/utils/work-item-filters/issue-type-filter-icon";
import type { TPickerSort } from "./use-work-item-picker";

const I18N = "work_item_picker";

/** 最后一列：默认「创建」；打开「包含已在其他迭代/发布中的」后换成所在迭代 / 所在发布 */
export type TPickerLastColumn = "created" | "cycle" | "release";

const GRID = {
  created: "grid-cols-[1rem_8rem_minmax(0,1fr)_7rem_5rem_9rem_7.75rem_4rem]",
  cycle: "grid-cols-[1rem_8rem_minmax(0,1fr)_7rem_5rem_9rem_7.75rem_12rem]",
  release: "grid-cols-[1rem_8rem_minmax(0,1fr)_7rem_5rem_9rem_7.75rem_12rem]",
} as const;

const shortDate = (value: string | null | undefined) => renderFormattedDate(value, "MM/dd");

const SortHead = (props: {
  label: string;
  field?: TWorkItemPickerOrderBy;
  sort?: TPickerSort;
  onSort?: (field: TWorkItemPickerOrderBy) => void;
}) => {
  const { label, field, sort, onSort } = props;
  if (!field || !onSort) return <span className="truncate">{label}</span>;
  const active = sort?.orderBy === field;
  const Arrow = sort?.order === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      className={cn(
        "flex min-w-0 items-center gap-1 hover:text-secondary",
        active ? "font-semibold text-accent-primary hover:text-accent-primary" : ""
      )}
      onClick={() => onSort(field)}
    >
      <span className="truncate">{label}</span>
      {active && <Arrow className="size-3 shrink-0" />}
    </button>
  );
};

const ContainerCell = (props: { kind: "cycle" | "release"; items: TWorkItemPickerContainer[] }) => {
  const [first, ...rest] = props.items;
  if (!first) return <span className="text-placeholder">—</span>;
  const Icon = props.kind === "cycle" ? CycleIcon : Rocket;
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 text-secondary"
      title={props.items.map((item) => item.name).join("\n")}
    >
      <Icon className="size-3.5 shrink-0 text-placeholder" />
      <span className="min-w-0 truncate">{first.name}</span>
      {first.status && (
        <span className="shrink-0 rounded bg-layer-1 px-1.5 py-0.5 text-11 font-medium text-tertiary">
          {first.status}
        </span>
      )}
      {rest.length > 0 && <span className="shrink-0 text-12 text-placeholder">+{rest.length}</span>}
    </span>
  );
};

const Assignees = observer(function Assignees(props: { ids: string[] }) {
  const { getUserDetails } = useMember();
  const users = props.ids.flatMap((id) => {
    const user = getUserDetails(id);
    return user ? [user] : [];
  });
  if (users.length === 0) return <span className="text-placeholder">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0 -space-x-1.5">
        {users.slice(0, 2).map((user) => (
          <span key={user.id} className="rounded-full ring-2 ring-[var(--bg-surface-1)]">
            <Avatar name={user.display_name} src={getFileURL(user.avatar_url ?? "")} size="md" />
          </span>
        ))}
      </span>
      <span className="min-w-0 truncate text-secondary">{users[0].display_name}</span>
      {users.length > 1 && <span className="shrink-0 text-12 text-placeholder">+{users.length - 1}</span>}
    </span>
  );
});

const PickerRow = (props: {
  row: TWorkItemPickerRow;
  workspaceSlug: string;
  issueType?: TIssueType;
  lastColumn: TPickerLastColumn;
  selected: boolean;
  onToggle: (row: TWorkItemPickerRow) => void;
}) => {
  const { row, workspaceSlug, issueType, lastColumn, selected, onToggle } = props;
  const { t } = useTranslation();
  const start = shortDate(row.start_date);
  const end = shortDate(row.target_date);

  return (
    <label
      className={cn(
        "group grid h-11.5 cursor-pointer items-center gap-x-3 border-b border-subtle px-5 text-13 sm:px-7",
        GRID[lastColumn],
        selected ? "bg-accent-subtle hover:bg-accent-subtle-hover" : "hover:bg-layer-1"
      )}
    >
      <Checkbox checked={selected} onChange={() => onToggle(row)} />
      <span className="font-mono truncate text-12 font-medium text-tertiary">
        {row.project__identifier}-{row.sequence_id}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        {issueType && (
          <IssueTypeFilterIcon name={issueType.logo_props?.icon?.name} color={issueType.logo_props?.icon?.color} />
        )}
        <span className="min-w-0 truncate text-14 text-primary" title={row.name}>
          {row.name}
        </span>
        <a
          href={generateWorkItemLink({
            workspaceSlug,
            projectId: row.project_id,
            issueId: row.id,
            projectIdentifier: row.project__identifier,
            sequenceId: row.sequence_id,
          })}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t(`${I18N}.open_in_new_tab`)}
          title={t(`${I18N}.open_in_new_tab`)}
          className="ml-auto grid size-6.5 shrink-0 place-items-center rounded-md border border-subtle bg-surface-1 text-tertiary opacity-0 group-hover:opacity-100 hover:text-primary focus-visible:opacity-100"
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink className="size-3.5" />
        </a>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-secondary">
        <StateGroupIcon stateGroup={row.state__group} color={row.state__color} />
        <span className="truncate">{row.state__name}</span>
      </span>
      <span
        className={cn(
          "flex items-center gap-1.5 whitespace-nowrap",
          row.priority === "none" ? "text-placeholder" : "font-medium text-primary"
        )}
      >
        <PriorityIcon priority={row.priority} size={14} />
        {t(`${I18N}.priorities.${row.priority ?? "none"}`)}
      </span>
      <Assignees ids={row.assignee_ids} />
      {start || end ? (
        <span className="truncate text-secondary tabular-nums">
          {start ?? <span className="text-placeholder">{t(`${I18N}.unset`)}</span>}
          <span className="mx-1 text-placeholder">→</span>
          {end ?? <span className="text-placeholder">{t(`${I18N}.unset`)}</span>}
        </span>
      ) : (
        <span className="text-placeholder">—</span>
      )}
      {lastColumn === "created" && <span className="text-tertiary tabular-nums">{shortDate(row.created_at)}</span>}
      {lastColumn === "cycle" && <ContainerCell kind="cycle" items={row.cycle ? [row.cycle] : []} />}
      {lastColumn === "release" && <ContainerCell kind="release" items={row.releases} />}
    </label>
  );
};

export const WorkItemPickerTable = (props: {
  rows: TWorkItemPickerRow[];
  workspaceSlug: string;
  issueTypeMap: Record<string, TIssueType>;
  lastColumn: TPickerLastColumn;
  isSelected: (id: string) => boolean;
  onToggle: (row: TWorkItemPickerRow) => void;
  headSelection: "none" | "some" | "all";
  onToggleHead: () => void;
  /** 不传就是不可排序（已选页签） */
  sort?: TPickerSort;
  onSort?: (field: TWorkItemPickerOrderBy) => void;
  dimmed?: boolean;
}) => {
  const {
    rows,
    workspaceSlug,
    issueTypeMap,
    lastColumn,
    isSelected,
    onToggle,
    headSelection,
    onToggleHead,
    sort,
    onSort,
  } = props;
  const { t } = useTranslation();
  const lastLabel =
    lastColumn === "created"
      ? t(`${I18N}.columns.created`)
      : t(`${I18N}.columns.${lastColumn === "cycle" ? "cycle" : "release"}`);

  return (
    <div role="table" className={cn("min-w-[60rem]", props.dimmed && "opacity-60 transition-opacity")}>
      <div
        role="row"
        className={cn(
          "sticky top-0 z-[1] grid h-9.5 items-center gap-x-3 border-y border-subtle bg-layer-1 px-5 text-12 font-medium text-tertiary sm:px-7",
          GRID[lastColumn]
        )}
      >
        <Checkbox
          checked={headSelection === "all"}
          indeterminate={headSelection === "some"}
          disabled={rows.length === 0}
          aria-label={t("multi_select_filter.select_all")}
          onChange={onToggleHead}
        />
        <SortHead label={t(`${I18N}.columns.id`)} field="sequence_id" sort={sort} onSort={onSort} />
        <SortHead label={t(`${I18N}.columns.title`)} />
        <SortHead label={t(`${I18N}.columns.state`)} />
        <SortHead label={t(`${I18N}.columns.priority`)} field="priority" sort={sort} onSort={onSort} />
        <SortHead label={t(`${I18N}.columns.assignees`)} />
        <SortHead label={t(`${I18N}.columns.dates`)} field="target_date" sort={sort} onSort={onSort} />
        <SortHead
          label={lastLabel}
          field={lastColumn === "created" ? "created_at" : undefined}
          sort={sort}
          onSort={onSort}
        />
      </div>
      {rows.map((row) => (
        <PickerRow
          key={row.id}
          row={row}
          workspaceSlug={workspaceSlug}
          issueType={row.type_id ? issueTypeMap[row.type_id] : undefined}
          lastColumn={lastColumn}
          selected={isSelected(row.id)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
};
