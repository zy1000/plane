import { PROJECT_STAGE_MAX_DURATION_DAYS } from "@plane/types";
import { addDaysToDate, findTotalDaysInRange, renderFormattedPayloadDate } from "@plane/utils";

/**
 * 表单里排期三件套的联动，规则与后端 `utils/project_stage.py::resolve_schedule` 一致：
 * 周期按自然日、首尾都算；结束和周期谁改了就由谁推另一个；改开始时周期不变、结束顺延。
 */
export type TStageSchedule = {
  /** `yyyy-MM-dd` */
  startDate: string | null;
  endDate: string | null;
  /** 输入框原文，要数字时用 parseDurationDays */
  durationDays: string;
};

/** 输入框原文 → 天数。没填是 null，填了但不是 1 ~ 上限的整数是 undefined */
export const parseDurationDays = (text: string): number | null | undefined => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  // type=number 会放过 1e3、1.5、-3
  if (!/^\d+$/.test(trimmed)) return undefined;
  const days = Number(trimmed);
  return days >= 1 && days <= PROJECT_STAGE_MAX_DURATION_DAYS ? days : undefined;
};

const endDateFrom = (startDate: string, days: number): string | null =>
  renderFormattedPayloadDate(addDaysToDate(startDate, days - 1)) ?? null;

const durationDaysFrom = (startDate: string, endDate: string): string => {
  const days = findTotalDaysInRange(startDate, endDate);
  return days !== undefined && days >= 1 ? String(days) : "";
};

/** 改开始：周期不变、结束顺延；还没有周期就拿现有结束重算周期 */
export const withStartDate = (schedule: TStageSchedule, startDate: string): TStageSchedule => {
  const days = parseDurationDays(schedule.durationDays);
  if (days) return { ...schedule, startDate, endDate: endDateFrom(startDate, days) };
  if (schedule.endDate) return { ...schedule, startDate, durationDays: durationDaysFrom(startDate, schedule.endDate) };
  return { ...schedule, startDate };
};

/** 改结束：周期跟着重算；清空结束连周期一起清 */
export const withEndDate = (schedule: TStageSchedule, endDate: string | null): TStageSchedule => {
  if (endDate === null) return { ...schedule, endDate: null, durationDays: "" };
  if (!schedule.startDate) return { ...schedule, endDate };
  return { ...schedule, endDate, durationDays: durationDaysFrom(schedule.startDate, endDate) };
};

/** 改周期：结束跟着推；清空周期连结束一起清；输入不合法时结束先不动 */
export const withDurationDays = (schedule: TStageSchedule, durationDays: string): TStageSchedule => {
  const days = parseDurationDays(durationDays);
  if (days === undefined) return { ...schedule, durationDays };
  if (days === null) return { ...schedule, durationDays, endDate: null };
  if (!schedule.startDate) return { ...schedule, durationDays };
  return { ...schedule, durationDays, endDate: endDateFrom(schedule.startDate, days) };
};
