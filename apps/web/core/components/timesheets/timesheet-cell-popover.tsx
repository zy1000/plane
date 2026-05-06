/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Listbox, Transition } from "@headlessui/react";
import { Check, ChevronDown, Clock, FileText, Plus, Trash2 } from "lucide-react";
import { usePopper } from "react-popper";
import { useOutsideClickDetector } from "@plane/hooks";
import { cn } from "@plane/utils";
import { addWorkHoursToStart, getWorkHours } from "@/helpers/timesheet-break.helper";
import {
  getTimesheetErrorMessage,
  hasDuplicateTimesheetEntry,
  type TTimeSheet,
  type TTimeSheetCreatePayload,
} from "@/services/issue/timesheet.service";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = (index % 2) * 30;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

const END_TIME_OPTIONS = [...TIME_OPTIONS, "24:00"];

const DEFAULT_START_TIME = "08:30";

function parseTimeInput(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  // 支持 "1.5"、"1.5h"、"1h"、"2" 等格式
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*h?$/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  if (isNaN(val) || val < 0.5) return null;
  // 取整到最近的 0.5 小时
  return Math.round(val * 2) / 2;
}

function formatHours(hours: number): string {
  if (hours === 0) return "0h";
  return `${hours}h`;
}

type TTimeSelectProps = {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  options?: string[];
};

function TimeSelect({ value, onChange, className, options }: TTimeSelectProps) {
  const items = options ?? TIME_OPTIONS;
  return (
    <Listbox value={value} onChange={onChange}>
      <div className={cn("relative", className)}>
        <Listbox.Button className="flex h-7 w-full items-center justify-between gap-1 rounded border border-subtle bg-layer-1/70 px-2 py-0.5 text-sm tabular-nums text-secondary outline-none hover:border-subtle-1 focus:border-accent-primary cursor-pointer">
          <span className="truncate">{value}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-tertiary" />
        </Listbox.Button>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="opacity-0 translate-y-1"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in duration-75"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options className="absolute z-50 mt-1 max-h-40 w-full overflow-y-auto rounded border border-subtle bg-surface-1 p-1 shadow-raised-200 focus:outline-none">
            {items.map((opt) => (
              <Listbox.Option
                key={opt}
                value={opt}
                className={({ active, selected }) =>
                  cn(
                    "flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm tabular-nums",
                    active && "bg-layer-1",
                    selected ? "text-accent-primary" : "text-secondary"
                  )
                }
              >
                {({ selected }) => (
                  <>
                    <span>{opt}</span>
                    {selected && <Check className="h-3 w-3" />}
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

type TTimesheetCellPopoverProps = {
  date: string;
  existingTimesheets: TTimeSheet[];
  currentUserId?: string;
  issueId?: string;
  testCaseId?: string;
  /** 当前行所属工时类别 id；创建时会带上，保证送样工时 / 项目工时等分类落到正确桶里。 */
  categoryId?: string;
  hours: number;
  readOnly?: boolean;
  onCreate: (data: TTimeSheetCreatePayload) => Promise<TTimeSheet | undefined>;
  onDelete: (id: string) => Promise<void>;
  children: React.ReactNode;
};

export function TimesheetCellPopover({
  date,
  existingTimesheets,
  currentUserId,
  issueId,
  testCaseId,
  categoryId,
  hours,
  readOnly = false,
  onCreate,
  onDelete,
  children,
}: TTimesheetCellPopoverProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState(DEFAULT_START_TIME);
  const [timeInput, setTimeInput] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [timeError, setTimeError] = useState("");

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "bottom",
    modifiers: [
      { name: "offset", options: { offset: [0, 4] } },
      { name: "preventOverflow", options: { padding: 12 } },
      { name: "flip", options: { fallbackPlacements: ["top"] } },
    ],
  });

  const resetFormState = () => {
    setStartTime(DEFAULT_START_TIME);
    setEndTime(DEFAULT_START_TIME);
    setTimeInput("");
    setDescription("");
    setTimeError("");
    setIsSaving(false);
  };

  const closePopover = () => {
    resetFormState();
    setIsOpen(false);
  };

  useOutsideClickDetector(dropdownRef, closePopover);

  const derivedHours = getWorkHours(startTime, endTime);
  const canSave = !!derivedHours && !timeError;

  const handleStartTimeChange = (v: string) => {
    setStartTime(v);
    setTimeError("");
    const parsedHours = parseTimeInput(timeInput);
    if (parsedHours) {
      setEndTime(addWorkHoursToStart(v, parsedHours));
      return;
    }
    if (getWorkHours(v, endTime) === null && endTime !== v) {
      setTimeError("结束时间必须晚于开始时间");
    }
  };

  const handleEndTimeChange = (v: string) => {
    setEndTime(v);
    setTimeError("");
    const duration = getWorkHours(startTime, v);
    if (duration !== null) {
      setTimeInput(String(duration));
      return;
    }
    if (startTime !== v) {
      setTimeError("结束时间必须晚于开始时间");
    }
  };

  const handleTimeInputChange = (value: string) => {
    setTimeInput(value);

    if (!value.trim()) {
      setTimeError("");
      return;
    }

    const parsedHours = parseTimeInput(value);
    if (parsedHours) {
      setEndTime(addWorkHoursToStart(startTime, parsedHours));
      setTimeError("");
      return;
    }

    setTimeError("请输入有效的工时，例如：1、1.5（最少0.5小时）");
  };

  const handleSave = async (close: () => void) => {
    const h = getWorkHours(startTime, endTime);
    if (!h) {
      setTimeError("请选择有效的开始和结束时间");
      return;
    }
    if (
      hasDuplicateTimesheetEntry({
        timesheets: existingTimesheets,
        memberId: currentUserId,
        date,
        startTime,
        endTime,
        issueId,
        testCaseId,
        categoryId,
      })
    ) {
      setTimeError("同一成员在同一项目/任务的同一时间段已存在工时记录，请勿重复登记。");
      return;
    }
    setIsSaving(true);
    try {
      await onCreate({
        date,
        start_time: startTime + ":00",
        end_time: endTime + ":00",
        hours: String(h),
        description,
        issue: issueId,
        test_case: testCaseId,
        category: categoryId,
      });
      close();
    } catch (error) {
      setTimeError(getTimesheetErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        ref={setReferenceElement}
        type="button"
        onClick={() => {
          if (isOpen) {
            closePopover();
            return;
          }
          resetFormState();
          setIsOpen(true);
        }}
        className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left outline-none"
      >
        {children}
      </button>
      {isOpen &&
        createPortal(
          <div
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
            data-prevent-outside-click
            className="z-[2000] w-72 rounded-lg border border-subtle bg-surface-1 shadow-raised-300 overflow-visible"
          >
              {/* 已有记录 */}
              {existingTimesheets.length > 0 && (
                <div className="border-b border-subtle px-3 py-2.5 space-y-1">
                  <p className="text-sm text-tertiary font-semibold mb-1.5">已记录工时</p>
                  {existingTimesheets.map((t) => {
                    const isOwn = t.member === currentUserId;
                    return (
                      <div
                        key={t.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 text-sm text-secondary min-w-0"
                      >
                        <div className="flex min-w-0 shrink items-baseline gap-1.5">
                          <span className="inline-block min-w-[11ch] shrink-0 text-left tabular-nums text-tertiary">
                            {t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-left text-tertiary">
                            {t.description ?? ""}
                          </span>
                        </div>
                        <div className="min-w-0 flex justify-start px-1">
                          <span className="shrink-0 font-semibold text-primary tabular-nums">
                            {formatHours(parseFloat(t.hours))}
                          </span>
                        </div>
                        {!readOnly && isOwn ? (
                          <button
                            type="button"
                            onClick={() => onDelete(t.id)}
                            className="flex shrink-0 items-center justify-center h-5 w-5 rounded text-tertiary hover:text-red-400 hover:bg-red-50 transition-colors"
                            aria-label="删除"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="w-5 shrink-0" aria-hidden />
                        )}
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 pt-1 text-sm font-semibold min-w-0">
                    <div className="flex min-w-0 shrink items-baseline gap-1.5">
                      <span className="inline-block min-w-[11ch] shrink-0 text-left font-semibold text-tertiary">
                        合计
                      </span>
                      <span className="min-w-0 flex-1" aria-hidden />
                    </div>
                    <div className="min-w-0 flex justify-start px-1">
                      <span className="shrink-0 font-semibold text-primary tabular-nums">
                        {formatHours(hours)}
                      </span>
                    </div>
                    <span className="w-5 shrink-0" aria-hidden />
                  </div>
                </div>
              )}

              {readOnly ? (
                <div className="px-3 py-2.5">
                  <p className="text-sm text-tertiary">此日期已超出可填报范围，仅可查看</p>
                </div>
              ) : (
                <div className="px-3 py-2.5 space-y-2">
                  <p className="text-sm text-tertiary font-semibold flex items-center gap-1">
                    <Plus className="h-3 w-3" />
                    添加工时
                  </p>
                  <input
                    type="text"
                    placeholder="输入工时（如：1.5）"
                    value={timeInput}
                    onChange={(e) => handleTimeInputChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSave(closePopover)}
                    className={cn(
                      "w-full rounded-sm border bg-transparent px-3 py-1.5 text-sm text-primary placeholder:text-placeholder",
                      "focus:outline-none focus:ring-1 focus:ring-accent-primary",
                      timeError ? "border-danger-strong" : "border-subtle"
                    )}
                  />
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-tertiary" />
                    <TimeSelect value={startTime} onChange={handleStartTimeChange} className="flex-1" />
                    <span className="text-tertiary text-sm">—</span>
                    <TimeSelect value={endTime} onChange={handleEndTimeChange} className="flex-1" options={END_TIME_OPTIONS} />
                  </div>
                  {derivedHours && derivedHours > 0 && (
                    <p className="text-sm text-accent-primary font-semibold">{formatHours(derivedHours)}</p>
                  )}
                  {timeError && <p className="text-sm text-danger-primary">{timeError}</p>}
                  <div className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-tertiary" />
                    <input
                      type="text"
                      placeholder="备注（可选）"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSave(closePopover)}
                      className="flex-1 bg-transparent border-none outline-none text-sm text-primary placeholder:text-placeholder"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    <button
                      onClick={closePopover}
                      className="px-3 py-1 rounded text-sm text-secondary hover:text-primary transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleSave(closePopover)}
                      disabled={isSaving || !canSave}
                      className={cn(
                        "rounded px-3 py-1 text-sm font-semibold transition-colors",
                        canSave
                          ? "bg-accent-primary text-on-color hover:bg-accent-primary-hover cursor-pointer"
                          : "bg-layer-1 text-placeholder cursor-not-allowed opacity-60"
                      )}
                    >
                      {isSaving ? "保存中…" : "保存"}
                    </button>
                  </div>
                </div>
              )}
          </div>,
          document.body
        )}
    </div>
  );
}
