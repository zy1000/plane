/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProjectVisibleMembers, TProjectVisiblePerson } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import {
  PermissionGroupPager,
  PermissionGroupSearch,
  PermissionGroupSegmented,
} from "@/components/workspace/settings/permission-groups";
import { useMember } from "@/hooks/store/use-member";
import { permissionSummary, shortDepartment, sourceChips } from "./helpers";
import type { TSourceChip, TVisibleChannel } from "./helpers";
import { ALL_CHANNELS, useVisiblePeopleFilter } from "./use-visible-people-filter";
import type { TVisibleScope, TVisibleSection } from "./use-visible-people-filter";

const GRID = "grid grid-cols-[minmax(180px,1fr)_160px_minmax(200px,1.1fr)_200px] items-center gap-x-5 px-6";
const SOURCE_CHIP = "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-13 whitespace-nowrap transition-colors";

/** 名单上方的一个授权来源标签：选中时蓝底；数据权限带灰色前缀 */
function SourceFilterChip(props: {
  label: string;
  prefix?: string;
  count: number;
  hint?: string;
  active: boolean;
  onClick: () => void;
}) {
  const { label, prefix, count, hint, active, onClick } = props;
  const chip = (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        SOURCE_CHIP,
        active
          ? "border-accent-strong bg-accent-subtle font-medium text-accent-primary"
          : "border-subtle bg-surface-1 text-primary hover:border-strong hover:bg-layer-1-hover"
      )}
    >
      {prefix && <span className={cn("text-12 font-normal", active ? "text-accent-primary" : "text-tertiary")}>{prefix}</span>}
      {label}
      <span className={cn("text-12 font-normal tabular-nums", active ? "text-accent-primary" : "text-tertiary")}>{count}</span>
    </button>
  );
  // 提示放在标签下方，不遮住上面的分段控件
  return hint ? (
    <Tooltip tooltipContent={hint} position="bottom">
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}

const CHIP_TONE: Record<TSourceChip["tone"], string> = {
  member: "bg-success-subtle text-success-primary",
  lead: "bg-accent-subtle text-accent-primary",
  owner: "bg-accent-subtle text-accent-primary",
  data: "bg-layer-1 text-primary",
};

const PersonRow = observer(function PersonRow(props: { person: TProjectVisiblePerson; total: number }) {
  const { person, total } = props;
  const { getUserDetails } = useMember();
  const user = getUserDetails(person.id);
  const name = user?.display_name || person.display_name;
  const permission = permissionSummary(person, total);
  return (
    <div className={cn(GRID, "min-h-14 border-t border-subtle text-14")}>
      <span className="flex min-w-0 items-center gap-2.5 py-2">
        <Avatar
          name={name}
          src={user?.avatar_url ? getFileURL(user.avatar_url) : undefined}
          size={28}
          shape="circle"
          className="shrink-0 text-12"
        />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-medium text-primary">{name}</span>
          {user?.employee_id && <span className="text-12 text-tertiary tabular-nums">{user.employee_id}</span>}
        </span>
      </span>
      <span className="truncate text-secondary" title={user?.department ?? undefined}>
        {shortDepartment(user?.department) || <span className="text-placeholder">—</span>}
      </span>
      <span className="flex flex-wrap gap-1.5 py-2">
        {sourceChips(person).map((chip) => (
          <span
            key={chip.key}
            title={chip.title}
            className={cn("inline-flex h-6 items-center gap-1 rounded-md px-2 text-12 whitespace-nowrap", CHIP_TONE[chip.tone])}
          >
            {chip.prefix && <span className="text-tertiary">{chip.prefix}</span>}
            {chip.label}
          </span>
        ))}
      </span>
      <span className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
        <span className={permission.isEmpty ? "text-placeholder" : "font-semibold text-primary"}>{permission.text}</span>
        {permission.note && (
          <span className="truncate text-13 text-tertiary" title={permission.note}>
            {permission.note}
          </span>
        )}
      </span>
    </div>
  );
});

const SECTION_META: Record<TVisibleSection, { label: string; dot: string }> = {
  with: { label: "具有操作权限", dot: "bg-warning-primary" },
  without: { label: "仅可查看", dot: "bg-current text-placeholder" },
};

/** 分段行：段名 + 段内总人数（跨页不变）+ 右侧说明 */
function SectionRow({ section, count, hint }: { section: TVisibleSection; count: number; hint?: string }) {
  const meta = SECTION_META[section];
  return (
    <div className="flex h-[38px] items-center justify-between gap-3 border-t border-subtle bg-layer-1 px-6">
      <span className="flex items-center gap-2 text-13 font-semibold text-secondary">
        <span className={cn("size-[7px] rounded-full", meta.dot)} />
        {meta.label}
        <span className="font-normal text-tertiary tabular-nums">{count}</span>
      </span>
      {hint && <span className="truncate text-12 text-tertiary">{hint}</span>}
    </div>
  );
}

type Props = {
  data: TProjectVisibleMembers;
  channels: TVisibleChannel[];
};

/** 人员明细：范围 / 搜索 / 授权来源标签，按「具有操作权限 / 仅可查看」分段，底部分页 */
export const VisiblePeopleTable = observer(function VisiblePeopleTable({ data, channels }: Props) {
  const { getUserDetails } = useMember();
  const filter = useVisiblePeopleFilter(data, channels, getUserDetails);
  const sectionHints: Record<TVisibleSection, string | undefined> = {
    with: filter.scope === "outside" ? "非项目成员，可在本项目内执行操作" : undefined,
    without: "可访问本项目，无操作权限",
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-16 font-semibold text-primary">人员明细</h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <PermissionGroupSegmented<TVisibleScope>
            items={[
              { key: "all", label: "全部", count: filter.counts.all },
              { key: "member", label: "项目成员", count: filter.counts.member },
              { key: "outside", label: "非项目成员", count: filter.counts.outside },
            ]}
            value={filter.scope}
            onChange={filter.setScope}
          />
          <PermissionGroupSearch
            value={filter.query}
            onChange={filter.setQuery}
            placeholder="搜索姓名 / 工号 / 部门"
            className="w-56"
          />
        </div>
      </div>

      {/* 授权来源：人数按当前范围算，0 人的不显示；点了只看这个来源 */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="授权来源">
        <span className="mr-1 text-13 text-tertiary">授权来源</span>
        <SourceFilterChip
          label="全部"
          count={filter.scopedCount}
          active={filter.channelKey === ALL_CHANNELS}
          onClick={() => filter.setChannelKey(ALL_CHANNELS)}
        />
        {filter.channelItems.map(({ channel, count }) => (
          <SourceFilterChip
            key={channel.key}
            label={channel.label}
            prefix={channel.kind === "data" ? "数据权限" : undefined}
            count={count}
            hint={channel.hint}
            active={filter.channelKey === channel.key}
            onClick={() => filter.setChannelKey(channel.key)}
          />
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
        <div className="min-w-[800px]">
          <div className={cn(GRID, "h-11 bg-layer-1 text-13 font-medium text-tertiary")}>
            <span>人员</span>
            <span>部门</span>
            <span>授权来源</span>
            <span>项目权限</span>
          </div>
          {filter.total === 0 ? (
            <p className="border-t border-subtle py-14 text-center text-14 text-placeholder">没有匹配的人员</p>
          ) : (
            filter.pageRows.map((row, index) => {
              // 本页里某一段的第一行之前画分段行（翻页后段名仍在，人数是整段的）
              const startsSection = index === 0 || filter.pageRows[index - 1]?.section !== row.section;
              return (
                <div key={row.person.id}>
                  {startsSection && (
                    <SectionRow
                      section={row.section}
                      count={filter.sectionCounts[row.section]}
                      hint={sectionHints[row.section]}
                    />
                  )}
                  <PersonRow person={row.person} total={data.total_permission_count} />
                </div>
              );
            })
          )}
          <div className="border-t border-subtle px-6 py-2.5">
            <PermissionGroupPager
              total={filter.total}
              page={filter.page}
              pageCount={filter.pageCount}
              onPageChange={filter.setPage}
              unit="人"
            />
          </div>
        </div>
      </div>
    </section>
  );
});
