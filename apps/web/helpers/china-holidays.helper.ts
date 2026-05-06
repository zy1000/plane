/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 中国法定节假日 / 调休补班数据。
 *
 * 数据来源：国务院办公厅每年发布的《关于 XXXX 年部分节假日安排的通知》。
 * - CHINA_HOLIDAYS：法定休假日（即使是周一到周五也不上班）。
 * - CHINA_MAKEUP_WORKDAYS：调休补班日（即使是周六/周日也需上班）。
 *
 * 新年份的安排发布后，需要把对应日期补充到下面两个数组里。
 * 日期格式必须是 `YYYY-MM-DD`，与 `formatDateKey` 输出保持一致。
 */
const CHINA_HOLIDAY_DATES: readonly string[] = [
  // 2025 年
  // 元旦
  "2025-01-01",
  // 春节
  "2025-01-28", "2025-01-29", "2025-01-30", "2025-01-31",
  "2025-02-01", "2025-02-02", "2025-02-03", "2025-02-04",
  // 清明节
  "2025-04-04", "2025-04-05", "2025-04-06",
  // 劳动节
  "2025-05-01", "2025-05-02", "2025-05-03", "2025-05-04", "2025-05-05",
  // 端午节
  "2025-05-31", "2025-06-01", "2025-06-02",
  // 国庆节 + 中秋节
  "2025-10-01", "2025-10-02", "2025-10-03", "2025-10-04",
  "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-08",

  // 2026 年
  // 元旦
  "2026-01-01", "2026-01-02", "2026-01-03",
  // 春节
  "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19",
  "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
  // 清明节
  "2026-04-04", "2026-04-05", "2026-04-06",
  // 劳动节
  "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
  // 端午节
  "2026-06-19", "2026-06-20", "2026-06-21",
  // 中秋节
  "2026-09-25", "2026-09-26", "2026-09-27",
  // 国庆节
  "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
  "2026-10-05", "2026-10-06", "2026-10-07",
];

const CHINA_MAKEUP_WORKDAY_DATES: readonly string[] = [
  // 2025 年
  "2025-01-26", // 春节调休
  "2025-02-08", // 春节调休
  "2025-04-27", // 劳动节调休
  "2025-09-28", // 国庆+中秋调休
  "2025-10-11", // 国庆+中秋调休

  // 2026 年
  "2026-01-04", // 元旦调休
  "2026-02-14", // 春节调休
  "2026-02-28", // 春节调休
  "2026-05-09", // 劳动节调休
  "2026-09-20", // 国庆调休
  "2026-10-10", // 国庆调休
];

const CHINA_HOLIDAYS = new Set<string>(CHINA_HOLIDAY_DATES);
const CHINA_MAKEUP_WORKDAYS = new Set<string>(CHINA_MAKEUP_WORKDAY_DATES);

/** 是否是中国法定节假日（按公告，应当休息的一天） */
export function isChinaHoliday(dateKey: string): boolean {
  return CHINA_HOLIDAYS.has(dateKey);
}

/** 是否是中国调休补班日（按公告，应当上班的周末） */
export function isChinaMakeupWorkday(dateKey: string): boolean {
  return CHINA_MAKEUP_WORKDAYS.has(dateKey);
}

/**
 * 综合判断给定日期在中国大陆是否需要上班：
 * - 法定节假日：不上班
 * - 调休补班日：即使是周末也要上班
 * - 其他情况：周一到周五上班，周六周日不上班
 *
 * 当落在 `CHINA_HOLIDAY_DATES` / `CHINA_MAKEUP_WORKDAY_DATES` 还未维护到的年份时，
 * 会退化为「周一到周五上班、周末不上班」的默认日历。
 */
export function isChinaWorkday(date: Date, dateKey: string): boolean {
  if (CHINA_HOLIDAYS.has(dateKey)) return false;
  if (CHINA_MAKEUP_WORKDAYS.has(dateKey)) return true;
  const day = date.getDay();
  return day !== 0 && day !== 6;
}
