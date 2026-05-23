/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Listbox, Transition } from "@headlessui/react";
import { Check, ChevronDown, Clock, Trash2, FileText } from "lucide-react";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { TIMESHEET_CATEGORY_KEY } from "@/constants/timesheet-category";
import {
  addWorkHoursToStart,
  getSuggestedStartTime,
  getWorkHours,
  getWorkTimeRangeError,
} from "@/helpers/timesheet-break.helper";
import { useUser } from "@/hooks/store/user";
import { useTimesheetCategories } from "@/hooks/store/use-timesheet-categories";
import { useUserDayTimesheets } from "@/hooks/store/use-user-day-timesheets";
import {
  getTimesheetErrorMessage,
  hasDuplicateTimesheetEntry,
  type TTimeSheet,
  type TTimeSheetCreatePayload,
} from "@/services/issue/timesheet.service";

type TTimesheetPanelProps = {
  workspaceSlug?: string;
  issueId?: string;
  testCaseId?: string;
  timesheets: TTimeSheet[];
  isLoading: boolean;
  totalHours: number;
  createTimesheet: (data: TTimeSheetCreatePayload) => Promise<TTimeSheet | undefined>;
  deleteTimesheet: (timesheetId: string) => Promise<void>;
  onClose?: () => void;
  /**
   * 是否在面板底部渲染「工时记录」明细列表。工作项详情已经把明细挪到 activity 区的
   * 「工时记录」tab 下，所以会传 false 隐藏，避免信息重复；测试用例等场景仍默认保留。
   */
  showDetailList?: boolean;
};

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = (index % 2) * 30;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

const END_TIME_OPTIONS = [...TIME_OPTIONS, "24:00"];

const DEFAULT_START_TIME = "08:30";

/**
 * 解析工时输入，如 "1.5"、"1.5h"、"2" → 小时数
 * 支持格式：1、1.5、2、1h、1.5h，最少0.5小时，取整到0.5
 */
function parseTimeInput(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*h?$/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  if (isNaN(val) || val < 0.5) return null;
  // 取整到最近的 0.5 小时
  return Math.round(val * 2) / 2;
}

/** 将小时数格式化为 "1.5h"、"2h" 等 */
function formatHours(hours: number): string {
  if (hours === 0) return "0h";
  return `${hours}h`;
}

/** 格式化日期为 "YYYY/MM/DD" */
function formatDisplayDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  } catch {
    return dateStr;
  }
}

/** 格式化时间为 "HH:mm" */
function formatDisplayTime(timeStr: string): string {
  try {
    const [h, m] = timeStr.split(":").map(Number);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  } catch {
    return timeStr;
  }
}

/** 按用户聚合工时 */
function aggregateByUser(
  timesheets: TTimeSheet[]
): { userId: string; name: string; avatarUrl?: string; totalHours: number }[] {
  const map = new Map<string, { name: string; avatarUrl?: string; totalHours: number }>();
  for (const t of timesheets) {
    const existing = map.get(t.member);
    const hours = parseFloat(t.hours || "0");
    if (existing) {
      existing.totalHours += hours;
    } else {
      map.set(t.member, {
        name: t.member_detail?.display_name || t.member,
        avatarUrl: t.member_detail?.avatar_url,
        totalHours: hours,
      });
    }
  }
  return Array.from(map.entries()).map(([userId, info]) => ({ userId, ...info }));
}

type TTimeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  options?: string[];
};

function TimeSelect(props: TTimeSelectProps) {
  const { value, onChange, className, options = TIME_OPTIONS } = props;

  return (
    <Listbox value={value} onChange={onChange}>
      <div className={cn("relative", className)}>
        <Listbox.Button className="group flex h-8 w-full items-center justify-between gap-1 rounded-md border border-subtle bg-layer-1/70 px-2 py-1 text-11 font-medium tabular-nums text-secondary shadow-sm outline-none transition-all hover:border-subtle-1 hover:bg-surface-1 focus:border-accent-primary focus:bg-surface-1 focus:ring-2 focus:ring-accent-primary/10 cursor-pointer">
          <span className="truncate tabular-nums">{value}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-tertiary transition-colors group-hover:text-secondary" />
        </Listbox.Button>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-150"
          enterFrom="opacity-0 translate-y-1"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-1"
        >
          <Listbox.Options className="absolute z-30 mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-subtle bg-surface-1 p-1.5 shadow-raised-200 focus:outline-none">
            {options.map((option) => (
              <Listbox.Option
                key={option}
                value={option}
                className={({ active, selected }) =>
                  cn(
                    "flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-body-xs-medium tabular-nums transition-colors",
                    active && "bg-layer-1",
                    selected ? "text-accent-primary" : "text-secondary"
                  )
                }
              >
                {({ selected }) => (
                  <>
                    <span>{option}</span>
                    {selected && <Check className="h-3.5 w-3.5" />}
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
}

export const TimesheetPanel = observer(function TimesheetPanel(props: TTimesheetPanelProps) {
  const {
    workspaceSlug,
    issueId,
    testCaseId,
    timesheets,
    isLoading,
    totalHours,
    createTimesheet,
    deleteTimesheet,
    onClose,
    showDetailList = true,
  } = props;

  const { data: currentUser } = useUser();
  const { getCategoryByKey } = useTimesheetCategories();
  const { getDayTimesheets, ensureLoaded } = useUserDayTimesheets(workspaceSlug, currentUser?.id);

  // 测试用例面板固定走 TEST_CASE 类别；
  // 工作项（issue）面板不再硬编码 ISSUE 类别 —— 通用 ISSUE 已在工时类别拆分后停用，
  // 真实类别（REQUIREMENT / TASK / BUG）需要后端根据 issue.type.name 推断，
  // 所以这里保留 test_case 的显式绑定，工作项场景下 category 为 undefined，
  // 由 TimeSheetSerializer 的 fallback 路由到对应子类别。
  const boundCategoryKey = testCaseId ? TIMESHEET_CATEGORY_KEY.TEST_CASE : undefined;
  const boundCategory = getCategoryByKey(boundCategoryKey);

  const [timeInput, setTimeInput] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [timeError, setTimeError] = useState("");
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const mergeDayTimesheets = (date: string, dayRecords: TTimeSheet[] = getDayTimesheets(date)) => {
    const localRecords = timesheets.filter((t) => t.date === date);
    const mergedById = new Map<string, TTimeSheet>();
    for (const t of dayRecords) mergedById.set(t.id, t);
    for (const t of localRecords) mergedById.set(t.id, t);
    return Array.from(mergedById.values());
  };

  const getSuggestedForDate = (date: string) => {
    const merged = mergeDayTimesheets(date);
    return getSuggestedStartTime(merged);
  };

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [startTime, setStartTime] = useState(() => getSuggestedForDate(todayStr));
  const [endTime, setEndTime] = useState(() => getSuggestedForDate(todayStr));

  useEffect(() => {
    let cancelled = false;

    const applySuggested = (dayRecords: TTimeSheet[]) => {
      const suggested = getSuggestedStartTime(mergeDayTimesheets(selectedDate, dayRecords));
      setStartTime(suggested);
      setEndTime(suggested);
      setTimeInput("");
    };

    applySuggested(getDayTimesheets(selectedDate));

    ensureLoaded(selectedDate).then((dayRecords) => {
      if (!cancelled) applySuggested(dayRecords);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const aggregated = useMemo(() => aggregateByUser(timesheets), [timesheets]);
  const derivedHours = getWorkHours(startTime, endTime);
  const canSave = !!timeInput.trim() && !!derivedHours;

  const handleTimeInputChange = (value: string) => {
    setTimeInput(value);
    if (timeError) setTimeError("");

    const parsedHours = parseTimeInput(value);
    if (parsedHours) {
      setEndTime(addWorkHoursToStart(startTime, parsedHours));
    }
  };

  const handleStartTimeChange = (value: string) => {
    setStartTime(value);
    if (timeError) setTimeError("");

    const parsedHours = parseTimeInput(timeInput);
    if (parsedHours) {
      setEndTime(addWorkHoursToStart(value, parsedHours));
      return;
    }

    const recalculatedHours = getWorkHours(value, endTime);
    if (recalculatedHours) {
      setTimeInput(String(recalculatedHours));
      return;
    }

    if (endTime && endTime !== value) {
      const error = getWorkTimeRangeError(value, endTime);
      if (error) setTimeError(error);
    }
  };

  const handleEndTimeChange = (value: string) => {
    setEndTime(value);
    if (timeError) setTimeError("");

    const recalculatedHours = getWorkHours(startTime, value);
    if (recalculatedHours) {
      setTimeInput(String(recalculatedHours));
      return;
    }

    if (startTime !== value) {
      const error = getWorkTimeRangeError(startTime, value);
      if (error) setTimeError(error);
    }
  };

  const handleSave = async () => {
    const hours = getWorkHours(startTime, endTime);
    if (!hours) {
      setTimeError(getWorkTimeRangeError(startTime, endTime) ?? "请选择有效的开始时间和结束时间");
      return;
    }
    if (!timeInput.trim()) {
      setTimeError("请输入有效的工时，例如：1、1.5（最少0.5小时）");
      return;
    }
    if (
      hasDuplicateTimesheetEntry({
        timesheets,
        memberId: currentUser?.id,
        date: selectedDate,
        startTime,
        endTime,
        issueId,
        testCaseId,
        categoryId: boundCategory?.id,
      })
    ) {
      setTimeError("同一成员在同一项目/任务的同一时间段已存在工时记录，请勿重复登记。");
      return;
    }
    setTimeError("");
    setIsSaving(true);
    try {
      await createTimesheet({
        date: selectedDate,
        start_time: startTime + ":00",
        end_time: endTime + ":00",
        hours: String(hours),
        description,
        issue: issueId,
        test_case: testCaseId,
        category: boundCategory?.id,
      });
      setTimeInput("");
      setDescription("");
      setSelectedDate(todayStr);
      setStartTime(getSuggestedForDate(todayStr));
      setEndTime(getSuggestedForDate(todayStr));
      setTimeError("");
    } catch (err) {
      setTimeError(getTimesheetErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full min-w-[320px] max-w-[420px]">
      {/* 顶部：总工时 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
        <div>
          <div className="flex items-center justify-between gap-8">
            <span className="text-body-sm-medium text-primary">所有任务的工时</span>
            <span className="text-body-sm-medium text-primary">{formatHours(totalHours)}</span>
          </div>
        </div>
      </div>

      {/* 时间录入表单 */}
      <div className="px-4 pt-3 pb-3 space-y-2">
        <div className="relative">
          <input
            type="text"
            placeholder="输入工时（如：1.5）"
            value={timeInput}
            onChange={(e) => handleTimeInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            className={cn(
              "w-full rounded-sm border bg-transparent px-3 py-1.5 text-body-xs-regular text-primary placeholder:text-placeholder",
              "focus:outline-none focus:ring-1 focus:ring-accent-primary",
              timeError ? "border-danger-strong" : "border-subtle"
            )}
          />
          {timeError && <p className="mt-1 text-11 text-danger-primary">{timeError}</p>}
        </div>

        {/* 日期 + 时间范围 */}
        <div className="flex items-center gap-1.5 text-body-xs-regular text-tertiary">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-[112px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-8 w-full min-w-0 rounded-md border border-subtle bg-layer-1/70 px-2 py-1 text-11 font-medium text-secondary shadow-sm outline-none transition-all hover:border-subtle-1 hover:bg-surface-1 focus:border-accent-primary focus:bg-surface-1 focus:ring-2 focus:ring-accent-primary/10 cursor-pointer"
              />
              <TimeSelect
                value={startTime}
                onChange={handleStartTimeChange}
                className="min-w-0 w-full"
              />
              <span className="px-0.5 text-tertiary">—</span>
              <TimeSelect
                value={endTime}
                onChange={handleEndTimeChange}
                className="min-w-0 w-full"
                options={END_TIME_OPTIONS}
              />
            </div>
          </div>
        </div>

        {/* 备注 */}
        <div className="flex items-center gap-1">
          <FileText className="h-3.5 w-3.5 shrink-0 text-tertiary" />
          <input
            type="text"
            placeholder="备注"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-body-xs-regular text-primary placeholder:text-placeholder"
          />
        </div>

        {/* 保存按钮 */}
        <div className="flex items-center justify-end pt-1">
          <button
            onClick={handleSave}
            disabled={isSaving || !canSave}
            className={cn(
              "rounded-sm px-4 py-1.5 text-body-xs-medium transition-colors",
              canSave
                ? "bg-accent-primary text-on-color hover:bg-accent-primary-hover cursor-pointer"
                : "bg-layer-1 text-placeholder cursor-not-allowed opacity-60"
            )}
          >
            {isSaving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      {/* 工时明细列表（测试用例等场景使用；工作项已移至 activity 区的「工时记录」tab） */}
      {showDetailList && timesheets.length > 0 && (
        <div className="border-t border-subtle px-4 py-3">
          <p className="text-body-xs-medium text-tertiary mb-2">工时记录</p>
          {isLoading ? (
            <p className="text-body-xs-regular text-tertiary">加载中…</p>
          ) : (
            <div className="space-y-1">
              {aggregated.map(({ userId, name, avatarUrl, totalHours: userHours }) => {
                const userTimesheets = timesheets.filter((t) => t.member === userId);

                return (
                  <div key={userId} className="space-y-1">
                    <div className="group flex items-center gap-2">
                      <button
                        className="flex flex-1 items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-layer-1 transition-colors text-left"
                        onClick={() => setExpandedEntry(expandedEntry === userId ? null : userId)}
                      >
                        <Avatar
                          src={getFileURL(avatarUrl ?? "")}
                          name={name}
                          size="sm"
                          showTooltip={false}
                        />
                        <span className="flex-1 text-body-xs-regular text-primary truncate">{name}</span>
                        <span className="text-body-xs-medium text-secondary">{formatHours(userHours)}</span>
                      </button>
                    </div>

                    {expandedEntry === userId && (
                      <div className="ml-6 space-y-1 border-l-2 border-subtle pl-3">
                        {userTimesheets.map((t) => {
                          const isCurrentUserRecord = currentUser?.id === t.member;

                          return (
                            <div
                              key={t.id}
                              className="group grid grid-cols-[minmax(0,1fr)_52px_20px] items-center gap-2 text-body-xs-regular text-tertiary"
                            >
                              <span className="truncate tabular-nums">
                                {formatDisplayDate(t.date)} {formatDisplayTime(t.start_time)} —{" "}
                                {formatDisplayTime(t.end_time)}
                              </span>
                              <span className="text-right tabular-nums text-secondary">
                                {formatHours(parseFloat(t.hours))}
                              </span>
                              {isCurrentUserRecord ? (
                                <button
                                  title="删除"
                                  onClick={() => deleteTimesheet(t.id)}
                                  className="hidden group-hover:flex items-center justify-center h-5 w-5 rounded text-tertiary hover:text-red-400 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              ) : (
                                <span className="block h-5 w-5" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
