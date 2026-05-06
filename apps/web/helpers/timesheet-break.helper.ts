/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 工时填报需要扣除的固定休息时间段。
 *
 * 单位：分钟（自然日 00:00 起算），区间含义为 `[start, end)`。
 * - 午休：12:30 – 13:30
 * - 晚饭：17:30 – 18:30
 *
 * 调整这里会同时影响 popover 内工时计算与时间线视图的拖拽 / 灰色"休息"块渲染。
 */
export const BREAK_INTERVALS: ReadonlyArray<readonly [number, number]> = [
  [12 * 60 + 30, 13 * 60 + 30],
  [17 * 60 + 30, 18 * 60 + 30],
];

/** 给定原始时段（分钟），返回扣除休息后实际可计入的工作分钟数；最小 0。 */
export function calcWorkMinutes(startMins: number, endMins: number): number {
  if (endMins <= startMins) return 0;
  let work = endMins - startMins;
  for (const [bs, be] of BREAK_INTERVALS) {
    work -= Math.max(0, Math.min(endMins, be) - Math.max(startMins, bs));
  }
  return Math.max(0, work);
}

/**
 * 计算两个 "HH:mm" 字符串之间的工时（小时，保留两位小数）。
 * 输入非法、结束 ≤ 起始 或扣除休息后 ≤ 0 时返回 null。
 */
export function getWorkHours(startTime: string, endTime: string): number | null {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  if (isNaN(startMins) || isNaN(endMins) || endMins <= startMins) return null;
  const work = calcWorkMinutes(startMins, endMins);
  if (work <= 0) return null;
  return Math.round((work / 60) * 100) / 100;
}

/**
 * 从某起始时间出发，累计满足指定工时（小时）的结束时间，自动跳过休息段。
 *
 * - 起始落在休息段内时，先把游标推到休息段结束再开始计时。
 * - 累计途中跨越的休息段会被整段跳过，确保最终工时严格等于输入小时数。
 * - 结果若超过 24:00 会被钳制为 "24:00"。
 */
export function addWorkHoursToStart(startTime: string, hours: number): string {
  const [sh, sm] = startTime.split(":").map(Number);
  let current = sh * 60 + sm;
  let remaining = Math.round(hours * 60);
  for (const [bs, be] of BREAK_INTERVALS) {
    if (current >= be) continue;
    if (current >= bs) {
      current = be;
      continue;
    }
    const gap = bs - current;
    if (remaining <= gap) {
      current += remaining;
      remaining = 0;
      break;
    }
    remaining -= gap;
    current = be;
  }
  current += remaining;
  if (current >= 24 * 60) return "24:00";
  const eh = Math.floor(current / 60);
  const em = current % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

/** 返回所有与 `[startMins, endMins)` 真正存在重叠的休息时段（以重叠区间表示）。 */
export function getOverlappingBreaks(
  startMins: number,
  endMins: number
): Array<{ start: number; end: number }> {
  const result: Array<{ start: number; end: number }> = [];
  for (const [bs, be] of BREAK_INTERVALS) {
    const overlapStart = Math.max(startMins, bs);
    const overlapEnd = Math.min(endMins, be);
    if (overlapEnd > overlapStart) {
      result.push({ start: overlapStart, end: overlapEnd });
    }
  }
  return result;
}
