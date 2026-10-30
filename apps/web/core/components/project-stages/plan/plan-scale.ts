/**
 * 规划视图的时间轴换算。日期一律是 `YYYY-MM-DD` 字符串，内部换成「距 1970-01-01 的整天数」算，
 * 全程按 UTC，不碰本地时区，免得夏令时或时区偏移让条错开一天。
 */

export type TPlanScale = "week" | "month" | "quarter";

/** 每天多少像素 */
export const PLAN_SCALE_DAY_PX: Record<TPlanScale, number> = {
  week: 28,
  month: 5.4,
  quarter: 1.8,
};

/** 左侧名称区宽度 */
export const PLAN_LEFT_WIDTH = 500;

const DAY_MS = 86400000;

export const toDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};

export const fromDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** 自然日、首尾都算 */
export const spanDays = (start: string, end: string) => toDay(end) - toDay(start) + 1;

/** `11/6`，不写年份（时间轴表头有年） */
export const formatShortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/** `10/26 – 11/6` */
export const formatRange = (start: string, end: string) => `${formatShortDate(start)} – ${formatShortDate(end)}`;

const monthStart = (day: number) => {
  const date = new Date(day * DAY_MS);
  return Math.round(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / DAY_MS);
};

/** 往前 / 往后整月挪，结果落在那个月的 1 号 */
export const addMonths = (day: number, months: number) => {
  const date = new Date(day * DAY_MS);
  return Math.round(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1) / DAY_MS);
};

export type TPlanRange = { startDay: number; endDay: number; days: number };

/** 滚到离两头不到这么多像素就再往外接一段 */
export const PLAN_EDGE_PX = 400;

/**
 * 时间轴往前（`before`）或往后（`after`）接整月，一次至少 6 个月、至少接出 1200px，
 * 这样季刻度下一次接出的也够滚一阵。
 */
export const extendPlanRange = (range: TPlanRange, side: "before" | "after", dayPx: number): TPlanRange => {
  const months = Math.max(6, Math.ceil(1200 / (30 * dayPx)));
  const startDay = side === "before" ? addMonths(range.startDay, -months) : range.startDay;
  const endDay = side === "after" ? addMonths(range.endDay + 1, months) - 1 : range.endDay;
  return { startDay, endDay, days: endDay - startDay + 1 };
};

/** 两段范围取并集（数据变了之后，已经滚出来的范围不能缩回去） */
export const unionPlanRange = (a: TPlanRange, b: TPlanRange): TPlanRange => {
  const startDay = Math.min(a.startDay, b.startDay);
  const endDay = Math.max(a.endDay, b.endDay);
  return { startDay, endDay, days: endDay - startDay + 1 };
};

/**
 * 时间轴范围：所有日期和今天里最早那个月往前多留一个月，最晚那个月往后多留三个月（规划看的是以后），
 * 至少半年，免得数据很少时整张图挤在左边。
 */
export const computePlanRange = (dates: (string | null | undefined)[], today: string): TPlanRange => {
  const days = dates.filter((date): date is string => Boolean(date)).map(toDay);
  const todayDay = toDay(today);
  const min = Math.min(todayDay, ...days);
  const max = Math.max(todayDay, ...days);
  const startDay = addMonths(monthStart(min), -1);
  let endDay = addMonths(monthStart(max), 4) - 1;
  if (endDay - startDay + 1 < 183) endDay = addMonths(startDay, 6) - 1;
  return { startDay, endDay, days: endDay - startDay + 1 };
};

export type TPlanTick = { key: string; left: number; width: number; year: number; month: number; day: number };

/**
 * 表头两行刻度。
 * - 周：上行按月，下行每天
 * - 月：上行按月，下行每周一
 * - 季：上行按季度，下行每月
 */
export const buildPlanTicks = (range: TPlanRange, scale: TPlanScale) => {
  const px = PLAN_SCALE_DAY_PX[scale];
  const toLeft = (day: number) => (day - range.startDay) * px;
  const months: TPlanTick[] = [];
  for (let day = range.startDay; day <= range.endDay; day = addMonths(day, 1)) {
    const date = new Date(day * DAY_MS);
    const next = Math.min(addMonths(day, 1), range.endDay + 1);
    months.push({
      key: `m-${day}`,
      left: toLeft(day),
      width: (next - day) * px,
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: 1,
    });
  }

  if (scale === "quarter") {
    const quarters: TPlanTick[] = [];
    for (const month of months) {
      if (quarters.length > 0 && (month.month - 1) % 3 !== 0) {
        quarters[quarters.length - 1].width += month.width;
        continue;
      }
      quarters.push({ ...month, key: `q-${month.key}` });
    }
    return { top: quarters, bottom: months, majorLines: quarters, minorLines: months };
  }

  const bottom: TPlanTick[] = [];
  for (let day = range.startDay; day <= range.endDay; day += 1) {
    const date = new Date(day * DAY_MS);
    // 1970-01-01 是周四，(day + 3) % 7 === 0 即周一
    const isMonday = (day + 3) % 7 === 0;
    if (scale === "month" && !isMonday) continue;
    bottom.push({
      key: `d-${day}`,
      left: toLeft(day),
      width: (scale === "week" ? 1 : 7) * px,
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    });
  }
  return { top: months, bottom, majorLines: months, minorLines: bottom };
};
