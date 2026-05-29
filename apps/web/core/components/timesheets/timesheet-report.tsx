/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import {
  Checkbox,
  DatePicker,
  Dropdown,
  Pagination,
  Popover,
  Select,
  Spin,
  message,
} from "antd";
import { Transition } from "@headlessui/react";
import dayjs, { type Dayjs } from "dayjs";
import {
  Calendar,
  ChevronDown,
  Clock3,
  Download,
  FileBarChart2,
  FolderOpen,
  Hash,
  ListFilter,
  ListFilterPlus,
  SlidersHorizontal,
  Tag,
  User,
} from "lucide-react";
import { Button as PropelButton, getButtonStyling } from "@plane/propel/button";
import { FilterIcon, FilterAppliedIcon, CloseIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";
import { EHeaderVariant, Header } from "@plane/ui";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useTimesheetCategories } from "@/hooks/store/use-timesheet-categories";
import { useTimesheetReport } from "@/hooks/store/use-timesheet-report";
import { EMPTY_PMS_PROJECT_NAME, type TTimesheetReportRow } from "@/services/issue/timesheet.service";
import { FiltersDropdown } from "@/components/issues/issue-layouts/filters";

type TTimesheetReportProps = {
  workspaceSlug: string;
};

const DATE_FORMAT = "YYYY-MM-DD";

// ---------- 日期快捷预设 ----------
type TDatePresetKey = "today" | "week" | "month" | "lastMonth";

type TDatePreset = {
  key: TDatePresetKey;
  label: string;
  getRange: () => { startDate: string; endDate: string };
};

const DATE_PRESETS: TDatePreset[] = [
  {
    key: "today",
    label: "今天",
    getRange: () => {
      const today = dayjs().format(DATE_FORMAT);
      return { startDate: today, endDate: today };
    },
  },
  {
    key: "week",
    label: "本周",
    getRange: () => ({
      startDate: dayjs().startOf("week").add(1, "day").format(DATE_FORMAT), // 周一
      endDate: dayjs().endOf("week").add(1, "day").format(DATE_FORMAT), // 周日
    }),
  },
  {
    key: "month",
    label: "本月",
    getRange: () => ({
      startDate: dayjs().startOf("month").format(DATE_FORMAT),
      endDate: dayjs().endOf("month").format(DATE_FORMAT),
    }),
  },
  {
    key: "lastMonth",
    label: "上月",
    getRange: () => ({
      startDate: dayjs().subtract(1, "month").startOf("month").format(DATE_FORMAT),
      endDate: dayjs().subtract(1, "month").endOf("month").format(DATE_FORMAT),
    }),
  },
];

type TFilterKey = "project" | "pmsProject" | "date" | "member" | "category";

type TPropertyConfig = {
  key: TFilterKey;
  label: string;
  icon: React.FC<{ className?: string }>;
};

const PROPERTY_CONFIGS: TPropertyConfig[] = [
  { key: "project", label: "项目", icon: FolderOpen },
  { key: "pmsProject", label: "项目编号", icon: Hash },
  { key: "date", label: "日期", icon: Calendar },
  { key: "member", label: "成员", icon: User },
  { key: "category", label: "类别", icon: Tag },
];

// 项目编号筛选中「空值」选项的展示文案
const EMPTY_PMS_PROJECT_LABEL = "（项目编号为空）";

// ---------- 列（显示）配置 ----------
type TReportColumnKey =
  | "pms_project_name"
  | "project_name"
  | "issue_name"
  | "case_name"
  | "category_name"
  | "member_name"
  | "date"
  | "time_range"
  | "hours"
  | "description";

type TReportColumn = {
  key: TReportColumnKey;
  title: string;
  width: number;
  render: (row: TTimesheetReportRow) => React.ReactNode;
};

const COLUMN_DEFS: TReportColumn[] = [
  { key: "pms_project_name", title: "项目编号", width: 280, render: (r) => r.pms_project_name || "-" },
  { key: "project_name", title: "项目", width: 160, render: (r) => r.project_name || "-" },
  { key: "issue_name", title: "工作项", width: 140, render: (r) => r.issue_name || "-" },
  { key: "case_name", title: "测试用例", width: 160, render: (r) => r.case_name || "-" },
  { key: "category_name", title: "类别", width: 100, render: (r) => r.category_name || "-" },
  { key: "member_name", title: "成员", width: 120, render: (r) => r.member_name || "-" },
  { key: "date", title: "日期", width: 110, render: (r) => r.date || "-" },
  {
    key: "time_range",
    title: "起止时间",
    width: 140,
    render: (r) => `${(r.start_time ?? "").slice(0, 5)} - ${(r.end_time ?? "").slice(0, 5)}`,
  },
  { key: "hours", title: "工时", width: 88, render: (r) => r.hours || "-" },
  { key: "description", title: "描述", width: 260, render: (r) => r.description || "-" },
];

const DEFAULT_VISIBLE_COLUMNS: Record<TReportColumnKey, boolean> = COLUMN_DEFS.reduce(
  (acc, col) => ({ ...acc, [col.key]: true }),
  {} as Record<TReportColumnKey, boolean>
);

const STORAGE_KEY = "timesheet-report-visible-columns";

export const TimesheetReport = observer(function TimesheetReport({
  workspaceSlug,
}: TTimesheetReportProps) {
  const { fetchProjects, workspaceProjectIds, getProjectById } = useProject();
  const { workspace: workspaceMemberStore, getUserDetails } = useMember();
  const { categories } = useTimesheetCategories();

  const {
    filters,
    patchFilters,
    resetFilters,
    page,
    pageSize,
    setPage,
    setPageSize,
    rows,
    total,
    isLoading,
    error,
    selectedIds,
    setSelectedIds,
    exportCurrent,
    exportSelected,
    isExporting,
  } = useTimesheetReport({ workspaceSlug });

  // —— 筛选行显隐 ——
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  // 显示列（持久化）
  const [visibleColumns, setVisibleColumns] = useState<Record<TReportColumnKey, boolean>>(() => {
    if (typeof window === "undefined") return DEFAULT_VISIBLE_COLUMNS;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_VISIBLE_COLUMNS;
      const parsed = JSON.parse(raw) as Partial<Record<TReportColumnKey, boolean>>;
      return { ...DEFAULT_VISIBLE_COLUMNS, ...parsed };
    } catch {
      return DEFAULT_VISIBLE_COLUMNS;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch {
      /* ignore */
    }
  }, [visibleColumns]);

  useEffect(() => {
    if (workspaceSlug) {
      fetchProjects(workspaceSlug);
      workspaceMemberStore.fetchWorkspaceMembers(workspaceSlug).catch(() => {
        /* 忽略成员拉取失败，下拉将为空 */
      });
    }
  }, [workspaceSlug, fetchProjects, workspaceMemberStore]);

  useEffect(() => {
    if (error) message.error(error);
  }, [error]);

  const projectOptions = useMemo(() => {
    const ids = workspaceProjectIds ?? [];
    return ids
      .map((id) => {
        const project = getProjectById(id);
        if (!project) return null;
        return { value: project.id, label: project.name };
      })
      .filter(Boolean) as { value: string; label: string }[];
  }, [workspaceProjectIds, getProjectById]);

  // 项目编号选项：去重已配置的 pms_project_name，并把「空值」固定置顶
  const pmsProjectOptions = useMemo(() => {
    const ids = workspaceProjectIds ?? [];
    const names = new Set<string>();
    for (const id of ids) {
      const name = getProjectById(id)?.pms_project_name?.trim();
      if (name) names.add(name);
    }
    const realOptions = Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
    return [{ value: EMPTY_PMS_PROJECT_NAME, label: EMPTY_PMS_PROJECT_LABEL }, ...realOptions];
  }, [workspaceProjectIds, getProjectById]);

  const memberOptions = useMemo(() => {
    const ids = workspaceMemberStore.getWorkspaceMemberIds(workspaceSlug) ?? [];
    return ids
      .map((id) => {
        const detail = getUserDetails(id);
        if (!detail) return null;
        return {
          value: id,
          label: detail.display_name || detail.first_name || detail.email || id,
        };
      })
      .filter(Boolean) as { value: string; label: string }[];
  }, [workspaceMemberStore, workspaceSlug, getUserDetails]);

  const categoryOptions = useMemo(
    () => categories.filter((c) => c.is_active).map((c) => ({ value: c.key, label: c.name })),
    [categories]
  );

  const dateRangeValue: [Dayjs | null, Dayjs | null] = useMemo(
    () => [
      filters.startDate ? dayjs(filters.startDate) : null,
      filters.endDate ? dayjs(filters.endDate) : null,
    ],
    [filters.startDate, filters.endDate]
  );

  const hasProjectFilter = (filters.projectIds?.length ?? 0) > 0;
  const hasPmsProjectFilter = (filters.pmsProjectNames?.length ?? 0) > 0;
  const hasMemberFilter = (filters.memberIds?.length ?? 0) > 0;
  const hasCategoryFilter = (filters.categoryKeys?.length ?? 0) > 0;
  const hasDateFilter = !!filters.startDate || !!filters.endDate;

  // 当前激活的筛选项（保证条件按添加顺序排列）
  const [activeKeys, setActiveKeys] = useState<TFilterKey[]>(() => {
    const keys: TFilterKey[] = [];
    if (hasProjectFilter) keys.push("project");
    if (hasPmsProjectFilter) keys.push("pmsProject");
    if (hasDateFilter) keys.push("date");
    if (hasMemberFilter) keys.push("member");
    if (hasCategoryFilter) keys.push("category");
    return keys;
  });

  // 当筛选值被外部改变后，确保对应的 chip 出现
  useEffect(() => {
    setActiveKeys((prev) => {
      const next = new Set(prev);
      if (hasProjectFilter) next.add("project");
      if (hasPmsProjectFilter) next.add("pmsProject");
      if (hasDateFilter) next.add("date");
      if (hasMemberFilter) next.add("member");
      if (hasCategoryFilter) next.add("category");
      return Array.from(next);
    });
  }, [hasProjectFilter, hasPmsProjectFilter, hasDateFilter, hasMemberFilter, hasCategoryFilter]);

  const hasAppliedConditions =
    hasProjectFilter || hasPmsProjectFilter || hasMemberFilter || hasCategoryFilter || hasDateFilter;
  const hasAnyConditions = activeKeys.length > 0 || hasAppliedConditions;

  const visibleColumnDefs = useMemo(
    () => COLUMN_DEFS.filter((c) => visibleColumns[c.key]),
    [visibleColumns]
  );

  const handleExportCurrent = async () => {
    try {
      await exportCurrent();
    } catch (err) {
      message.error((err as { detail?: string } | null)?.detail || "导出失败，请重试");
    }
  };

  const handleExportSelected = async () => {
    if (selectedIds.length === 0) {
      message.info("请先勾选要导出的记录");
      return;
    }
    try {
      await exportSelected();
    } catch (err) {
      message.error((err as { detail?: string } | null)?.detail || "导出失败，请重试");
    }
  };

  // 全选 / 半选
  const allRowIds = rows.map((r) => r.id);
  const isAllSelected = rows.length > 0 && allRowIds.every((id) => selectedIds.includes(id));
  const isIndeterminate = !isAllSelected && rows.some((r) => selectedIds.includes(r.id));

  const toggleAll = () => {
    if (isAllSelected) setSelectedIds(selectedIds.filter((id) => !allRowIds.includes(id)));
    else setSelectedIds(Array.from(new Set([...selectedIds, ...allRowIds])));
  };

  const toggleRow = (id: string) => {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter((x) => x !== id));
    else setSelectedIds([...selectedIds, id]);
  };

  // —— 添加 / 移除 chip ——
  const addChip = (key: TFilterKey) => {
    if (!activeKeys.includes(key)) setActiveKeys([...activeKeys, key]);
    setIsFilterVisible(true);
  };
  const removeChip = (key: TFilterKey) => {
    setActiveKeys((prev) => prev.filter((k) => k !== key));
    if (key === "project") patchFilters({ projectIds: undefined });
    if (key === "pmsProject") patchFilters({ pmsProjectNames: undefined });
    if (key === "date") patchFilters({ startDate: undefined, endDate: undefined });
    if (key === "member") patchFilters({ memberIds: undefined });
    if (key === "category") patchFilters({ categoryKeys: undefined });
  };

  // 多选 chip 展示文案：0 -> 占位；1 -> 名称；>1 -> "名称 +N"
  const formatMultiValueLabel = (
    ids: string[] | undefined,
    options: { value: string; label: string }[]
  ): string | undefined => {
    if (!ids || ids.length === 0) return undefined;
    const labels = ids.map((id) => options.find((o) => o.value === id)?.label ?? id);
    if (labels.length === 1) return labels[0];
    return `${labels[0]} +${labels.length - 1}`;
  };

  const availableProperties = PROPERTY_CONFIGS.filter((p) => !activeKeys.includes(p.key));

  const totalWidth = 48 + visibleColumnDefs.reduce((s, c) => s + c.width, 0);

  const currentPageHours = useMemo(() => {
    const sum = rows.reduce((acc, r) => {
      const value = Number.parseFloat(r.hours ?? "");
      return Number.isFinite(value) ? acc + value : acc;
    }, 0);
    return Number.isInteger(sum) ? String(sum) : sum.toFixed(2);
  }, [rows]);

  const activePresetKey = useMemo<TDatePresetKey | null>(() => {
    if (!filters.startDate || !filters.endDate) return null;
    const hit = DATE_PRESETS.find((p) => {
      const r = p.getRange();
      return r.startDate === filters.startDate && r.endDate === filters.endDate;
    });
    return hit ? hit.key : null;
  }, [filters.startDate, filters.endDate]);

  const applyDatePreset = (preset: TDatePreset) => {
    const range = preset.getRange();
    if (
      activePresetKey === preset.key &&
      filters.startDate === range.startDate &&
      filters.endDate === range.endDate
    ) {
      // 再次点击已激活的预设：取消日期筛选
      patchFilters({ startDate: undefined, endDate: undefined });
      setActiveKeys((prev) => prev.filter((k) => k !== "date"));
      return;
    }
    patchFilters({ startDate: range.startDate, endDate: range.endDate });
    setActiveKeys((prev) => (prev.includes("date") ? prev : [...prev, "date"]));
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface-1">
      {/* —— 顶部工具栏：筛选按钮（与工作项一致） / 计数 / 显示 / 导出 —— */}
      {/* @container 让下方 FiltersDropdown 的 @4xl 断点相对工具栏宽度响应，保持与工作项一致的文字/图标切换 */}
      <div className="@container flex h-10 flex-shrink-0 items-center gap-2 border-b border-subtle bg-surface-1 px-3">
        {/* 左侧：标题 + 共 X 条 + 当前页工时合计 */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center gap-1.5 text-13 font-medium text-primary">
            <FileBarChart2 className="size-4 text-tertiary" />
            <span className="truncate">工时报表</span>
          </div>
          <span className="h-4 w-px bg-subtle" aria-hidden />
          <span className="px-1 text-13 text-tertiary">共 {total} 条</span>
          <div className="flex items-center gap-1 px-1 text-13 text-secondary">
            <Clock3 className="size-4 text-tertiary" />
            <span className="text-tertiary">本页合计</span>
            <span className="font-medium text-primary">{currentPageHours}</span>
            <span className="text-tertiary">h</span>
          </div>
          {selectedIds.length > 0 && (
            <div className="flex items-center rounded-sm bg-accent-subtle px-2 py-0.5 text-11 text-accent-primary">
              已选 {selectedIds.length}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* 日期快捷预设 —— 点击切换日期筛选；再次点击已激活项取消 */}
          <div className="flex items-center gap-0.5 rounded-md border border-subtle-1 bg-surface-1 p-0.5">
            {DATE_PRESETS.map((preset) => {
              const active = activePresetKey === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyDatePreset(preset)}
                  className={cn(
                    "h-6 rounded-sm px-2 text-11 transition-colors",
                    active
                      ? "bg-accent-subtle text-accent-primary font-medium"
                      : "text-secondary hover:bg-layer-2-hover"
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {!hasAppliedConditions && !isFilterVisible ? (
            <TopAddFilterTrigger availableProperties={availableProperties} onPick={(k) => addChip(k)} />
          ) : (
            <FilterToggleButton
              hasAnyConditions={hasAppliedConditions}
              isVisible={isFilterVisible}
              onToggle={() => setIsFilterVisible((v) => !v)}
            />
          )}

          <FiltersDropdown miniIcon={<SlidersHorizontal className="size-3.5" />} title="显示">
            <DisplayPanel
              visibleColumns={visibleColumns}
              onChange={(key) =>
                setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))
              }
              onReset={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}
              onShowAll={() =>
                setVisibleColumns(
                  COLUMN_DEFS.reduce(
                    (acc, c) => ({ ...acc, [c.key]: true }),
                    {} as Record<TReportColumnKey, boolean>
                  )
                )
              }
            />
          </FiltersDropdown>

          <Dropdown
            menu={{
              items: [
                { key: "current", label: "导出当前筛选" },
                {
                  key: "selected",
                  label: `导出已选 ${selectedIds.length} 条`,
                  disabled: selectedIds.length === 0,
                },
              ],
              onClick: ({ key }) => {
                if (key === "current") handleExportCurrent();
                else if (key === "selected") handleExportSelected();
              },
            }}
          >
            <PropelButton
              variant="primary"
              size="lg"
              loading={isExporting}
              prependIcon={<Download />}
              appendIcon={<ChevronDown />}
            >
              导出
            </PropelButton>
          </Dropdown>
        </div>
      </div>

      {/* —— 筛选行（完全照搬工作项 FiltersRow 的外观） —— */}
      <Transition
        show={isFilterVisible}
        enter="transition-all duration-150 ease-out"
        enterFrom="opacity-0 -translate-y-1"
        enterTo="opacity-100 translate-y-0"
        leave="transition-all duration-100 ease-in"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 -translate-y-1"
      >
        <Header variant={EHeaderVariant.TERNARY} className="min-h-11 bg-surface-1 !px-3">
          <div className="flex w-full items-start gap-2 rounded-lg bg-layer-1 px-4 py-2">
            <div className="flex w-full flex-wrap items-center gap-2">
              {activeKeys.map((key) => {
                const cfg = PROPERTY_CONFIGS.find((p) => p.key === key)!;
                if (key === "project") {
                  return (
                    <FilterChip
                      key={key}
                      config={cfg}
                      valueLabel={formatMultiValueLabel(filters.projectIds, projectOptions)}
                      onRemove={() => removeChip(key)}
                      valuePopover={
                        <div className="p-2">
                          <Select
                            autoFocus
                            defaultOpen
                            mode="multiple"
                            showSearch
                            allowClear
                            maxTagCount="responsive"
                            style={{ width: 260 }}
                            optionFilterProp="label"
                            placeholder="选择项目"
                            value={filters.projectIds ?? []}
                            onChange={(value: string[]) =>
                              patchFilters({ projectIds: value.length > 0 ? value : undefined })
                            }
                            options={projectOptions}
                          />
                        </div>
                      }
                    />
                  );
                }
                if (key === "pmsProject") {
                  return (
                    <FilterChip
                      key={key}
                      config={cfg}
                      valueLabel={formatMultiValueLabel(filters.pmsProjectNames, pmsProjectOptions)}
                      onRemove={() => removeChip(key)}
                      valuePopover={
                        <div className="p-2">
                          <Select
                            autoFocus
                            defaultOpen
                            mode="multiple"
                            showSearch
                            allowClear
                            maxTagCount="responsive"
                            style={{ width: 260 }}
                            optionFilterProp="label"
                            placeholder="选择项目编号"
                            value={filters.pmsProjectNames ?? []}
                            onChange={(value: string[]) =>
                              patchFilters({ pmsProjectNames: value.length > 0 ? value : undefined })
                            }
                            options={pmsProjectOptions}
                          />
                        </div>
                      }
                    />
                  );
                }
                if (key === "date") {
                  const rangeText =
                    filters.startDate || filters.endDate
                      ? `${filters.startDate ?? "…"} ~ ${filters.endDate ?? "…"}`
                      : undefined;
                  return (
                    <FilterChip
                      key={key}
                      config={cfg}
                      valueLabel={rangeText}
                      onRemove={() => removeChip(key)}
                      valuePopover={
                        <div className="p-2">
                          <DatePicker.RangePicker
                            value={dateRangeValue}
                            allowEmpty={[true, true]}
                            onChange={(range) => {
                              const [start, end] = range ?? [null, null];
                              patchFilters({
                                startDate: start ? start.format(DATE_FORMAT) : undefined,
                                endDate: end ? end.format(DATE_FORMAT) : undefined,
                              });
                            }}
                          />
                        </div>
                      }
                    />
                  );
                }
                if (key === "member") {
                  return (
                    <FilterChip
                      key={key}
                      config={cfg}
                      valueLabel={formatMultiValueLabel(filters.memberIds, memberOptions)}
                      onRemove={() => removeChip(key)}
                      valuePopover={
                        <div className="p-2">
                          <Select
                            autoFocus
                            defaultOpen
                            mode="multiple"
                            showSearch
                            allowClear
                            maxTagCount="responsive"
                            style={{ width: 260 }}
                            optionFilterProp="label"
                            placeholder="选择成员"
                            value={filters.memberIds ?? []}
                            onChange={(value: string[]) =>
                              patchFilters({ memberIds: value.length > 0 ? value : undefined })
                            }
                            options={memberOptions}
                          />
                        </div>
                      }
                    />
                  );
                }
                // category
                return (
                  <FilterChip
                    key={key}
                    config={cfg}
                    valueLabel={formatMultiValueLabel(filters.categoryKeys, categoryOptions)}
                    onRemove={() => removeChip(key)}
                    valuePopover={
                      <div className="p-2">
                        <Select
                          autoFocus
                          defaultOpen
                          mode="multiple"
                          showSearch
                          allowClear
                          maxTagCount="responsive"
                          style={{ width: 260 }}
                          optionFilterProp="label"
                          placeholder="选择类别"
                          value={filters.categoryKeys ?? []}
                          onChange={(value: string[]) =>
                            patchFilters({ categoryKeys: value.length > 0 ? value : undefined })
                          }
                          options={categoryOptions}
                        />
                      </div>
                    }
                  />
                );
              })}

              {/* 添加筛选按钮 —— ListFilterPlus 图标，沿用 AddFilterButton 的视觉 */}
              <AddFilterTrigger
                availableProperties={availableProperties}
                onPick={(k) => addChip(k)}
              />
            </div>
            {/* 右侧：清除按钮（仅在已应用筛选时显示） */}
            {hasAnyConditions && (
              <div className="flex items-center gap-2 border-l border-subtle pl-4">
                <PropelButton
                  variant="secondary"
                  className="py-1"
                  onClick={() => {
                    resetFilters();
                    setActiveKeys([]);
                  }}
                >
                  Clear all
                </PropelButton>
              </div>
            )}
          </div>
        </Header>
      </Transition>

      {/* —— 表格主体 —— */}
      {/* 使用与工作项 spreadsheet 相同的横纵滚动条工具类，保证列过多时出现横向滚动条 */}
      <div className="relative flex-1 min-h-0 vertical-scrollbar horizontal-scrollbar scrollbar-lg">
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface-1/60">
            <Spin />
          </div>
        )}

        <table
          className="w-full min-w-full table-fixed bg-surface-1 text-13 text-secondary"
          style={{ minWidth: totalWidth }}
        >
          <colgroup>
            <col style={{ width: 48 }} />
            {visibleColumnDefs.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-[1] border-b border-subtle">
            <tr>
              <th
                className="sticky left-0 z-[2] h-11 border-r border-b border-subtle bg-layer-1 px-3 text-center align-middle font-medium"
                style={{ width: 48 }}
              >
                <Checkbox checked={isAllSelected} indeterminate={isIndeterminate} onChange={toggleAll} />
              </th>
              {visibleColumnDefs.map((col, idx) => (
                <th
                  key={col.key}
                  className={cn(
                    "h-11 border-b border-subtle bg-layer-1 px-3 text-left align-middle font-medium text-secondary",
                    idx < visibleColumnDefs.length - 1 && "border-r"
                  )}
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isLoading && (
              <tr>
                <td
                  colSpan={visibleColumnDefs.length + 1}
                  className="px-4 py-16 text-center text-13 text-tertiary"
                >
                  暂无数据
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const checked = selectedIds.includes(row.id);
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-subtle transition-colors hover:bg-layer-1/40",
                    checked && "bg-accent-primary/5"
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 h-11 border-r border-subtle px-3 text-center align-middle",
                      checked ? "bg-accent-primary/5" : "bg-surface-1"
                    )}
                  >
                    <Checkbox checked={checked} onChange={() => toggleRow(row.id)} />
                  </td>
                  {visibleColumnDefs.map((col, idx) => (
                    <td
                      key={col.key}
                      className={cn(
                        "h-11 px-3 align-middle",
                        idx < visibleColumnDefs.length - 1 && "border-r border-subtle"
                      )}
                      title={String(col.render(row) ?? "")}
                    >
                      <div className="truncate">{col.render(row)}</div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* —— 底部：分页 —— */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-2">
        <div className="flex items-center gap-2 text-11 text-tertiary">
          {selectedIds.length > 0 ? (
            <span>
              已选 <span className="text-primary">{selectedIds.length}</span> / {total}
            </span>
          ) : (
            <span>共 {total} 条</span>
          )}
        </div>
        <Pagination
          size="small"
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          pageSizeOptions={[20, 50, 100, 200]}
          onChange={(nextPage, nextPageSize) => {
            if (nextPageSize !== pageSize) {
              setPageSize(nextPageSize);
              setPage(1);
            } else {
              setPage(nextPage);
            }
          }}
        />
      </div>
    </div>
  );
});

// ======================================================================
// 子组件：筛选切换 Icon 按钮 —— 复刻 packages/web 中 FiltersToggle 的样式
// ======================================================================

type TFilterToggleProps = {
  hasAnyConditions: boolean;
  isVisible: boolean;
  onToggle: () => void;
};

function FilterToggleButton({ hasAnyConditions, isVisible, onToggle }: TFilterToggleProps) {
  const showPill = hasAnyConditions;
  const Icon = showPill ? FilterAppliedIcon : FilterIcon;

  // 保持与 TopAddFilterTrigger 相同的尺寸（h-7 px-2 py-0.5 方框），避免切换状态时按钮尺寸跳变
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="切换筛选"
      className={cn(
        "grid h-7 cursor-pointer place-items-center rounded-md border border-subtle-1 px-2 py-0.5 transition-all duration-200 hover:bg-layer-2-hover",
        showPill && "border-accent-subtle-1 text-accent-primary hover:border-accent-subtle-1",
        showPill && (isVisible ? "bg-accent-subtle-hover" : "bg-accent-subtle")
      )}
    >
      <Icon
        className={cn("size-4 text-secondary", showPill && "text-accent-primary [&_path]:fill-current")}
      />
    </button>
  );
}

// ======================================================================
// 子组件：筛选条件 Chip —— 复刻 FilterItemContainer / FilterItem 的三段式视觉
// ======================================================================

type TFilterChipProps = {
  config: TPropertyConfig;
  valueLabel?: string;
  valuePopover: React.ReactNode;
  onRemove: () => void;
};

function FilterChip({ config, valueLabel, valuePopover, onRemove }: TFilterChipProps) {
  const Icon = config.icon;
  const [valueOpen, setValueOpen] = useState(!valueLabel); // 首次未选值时自动打开

  return (
    <div className="flex h-7 items-stretch overflow-hidden rounded-sm border border-subtle bg-surface-1 transition-all duration-200">
      {/* Property */}
      <div className="flex h-full items-center gap-1 border-r border-subtle-1 px-2 py-[5px] text-11 text-tertiary">
        <Icon className="size-3.5" />
        <span className="truncate">{config.label}</span>
      </div>
      {/* Operator */}
      <div className="flex h-full items-center border-r border-subtle-1 px-2 text-13 text-secondary">
        is
      </div>
      {/* Value */}
      <Popover
        open={valueOpen}
        onOpenChange={setValueOpen}
        trigger="click"
        placement="bottomLeft"
        arrow={false}
        overlayInnerStyle={{ padding: 0 }}
        content={valuePopover}
      >
        <button
          type="button"
          className="flex h-full min-w-[64px] items-center border-r border-subtle-1 px-2 text-13 transition-all duration-300 ease-in-out hover:bg-layer-2-hover"
        >
          <span className={cn("truncate", valueLabel ? "text-secondary" : "text-placeholder")}>{valueLabel || "--"}</span>
        </button>
      </Popover>
      {/* Close */}
      <button
        onClick={onRemove}
        type="button"
        className="bg-layer-transparent px-1.5 text-placeholder hover:bg-layer-transparent-hover hover:text-tertiary focus:outline-none"
        aria-label="移除筛选"
      >
        <CloseIcon className="size-3.5" />
      </button>
    </div>
  );
}

// ======================================================================
// 子组件：添加筛选按钮（ListFilterPlus） —— 复刻 AddFilterButton
// ======================================================================

type TAddFilterTriggerProps = {
  availableProperties: TPropertyConfig[];
  onPick: (key: TFilterKey) => void;
};

function AddFilterTrigger({ availableProperties, onPick }: TAddFilterTriggerProps) {
  const [open, setOpen] = useState(false);

  if (availableProperties.length === 0) return null;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      arrow={false}
      overlayInnerStyle={{ padding: 0 }}
      content={
        <div className="w-56 p-1">
          {availableProperties.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onPick(p.key);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-13 text-secondary transition-colors hover:bg-layer-2-hover"
              >
                <Icon className="size-4 text-tertiary" />
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      }
    >
      <button
        type="button"
        className={cn(getButtonStyling("secondary", "lg"), "py-[5px]")}
        aria-label="添加筛选"
      >
        <ListFilterPlus className="size-4 text-secondary" />
      </button>
    </Popover>
  );
}

type TTopAddFilterTriggerProps = {
  availableProperties: TPropertyConfig[];
  onPick: (key: TFilterKey) => void;
};

function TopAddFilterTrigger({ availableProperties, onPick }: TTopAddFilterTriggerProps) {
  const [open, setOpen] = useState(false);

  if (availableProperties.length === 0) return null;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      arrow={false}
      overlayInnerStyle={{ padding: 0 }}
      content={
        <div className="w-56 p-1">
          {availableProperties.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onPick(p.key);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-13 text-secondary transition-colors hover:bg-layer-2-hover"
              >
                <Icon className="size-4 text-tertiary" />
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      }
    >
      <button
        type="button"
        className={cn(
          "grid h-7 cursor-pointer place-items-center rounded-md border px-2 py-0.5 transition-all duration-200",
          open
            ? "border-accent-subtle-1 bg-accent-subtle text-accent-primary"
            : "border-subtle-1 hover:bg-layer-2-hover"
        )}
        aria-label="添加筛选"
      >
        <ListFilter className={cn("size-4", open ? "text-accent-primary" : "text-secondary")} />
      </button>
    </Popover>
  );
}

// ======================================================================
// 子组件：显示（列开关）弹出层 —— 同工作项 display dropdown 的 chip 风格
// ======================================================================

type TDisplayPanelProps = {
  visibleColumns: Record<TReportColumnKey, boolean>;
  onChange: (key: TReportColumnKey) => void;
  onReset: () => void;
  onShowAll: () => void;
};

function DisplayPanel({ visibleColumns, onChange, onReset, onShowAll }: TDisplayPanelProps) {
  return (
    <div className="flex w-[260px] flex-col gap-2 p-3">
      <div className="text-11 font-medium uppercase tracking-wide text-tertiary">显示属性</div>
      <div className="flex flex-wrap gap-1.5">
        {COLUMN_DEFS.map((col) => {
          const active = visibleColumns[col.key];
          return (
            <button
              key={col.key}
              type="button"
              onClick={() => onChange(col.key)}
              className={cn(
                "rounded-sm border px-2 py-0.5 text-11 transition-all",
                active
                  ? "border-accent-strong bg-accent-primary text-on-color"
                  : "border-subtle hover:bg-layer-1"
              )}
            >
              {col.title}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-subtle pt-2">
        <button type="button" onClick={onReset} className="text-11 text-secondary hover:text-primary">
          重置为默认
        </button>
        <button type="button" onClick={onShowAll} className="text-11 text-accent-primary hover:opacity-80">
          全部显示
        </button>
      </div>
    </div>
  );
}
