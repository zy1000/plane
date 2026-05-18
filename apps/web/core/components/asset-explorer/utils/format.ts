import { formatCNDateTime } from "@/components/qa/cases/util";

const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"] as const;
const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const formatBytes = (value?: number | null): string => {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const idx = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const num = bytes / Math.pow(1024, idx);
  const digits = idx === 0 ? 0 : num >= 10 ? 1 : 2;
  return `${num.toFixed(digits)} ${BYTE_UNITS[idx]}`;
};

export const formatRelative = (raw?: string | null): string => {
  if (!raw) return "—";
  const target = new Date(raw).getTime();
  if (!Number.isFinite(target)) return "—";
  const diff = Date.now() - target;
  const min = Math.round(diff / (60 * 1000));
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.round(hour / 24);
  if (day < 30) return `${day} 天前`;
  return formatCNDateTime(raw);
};

export const formatExactDateTime = (raw?: string | null): string => {
  if (!raw) return "—";
  const target = new Date(raw);
  if (!Number.isFinite(target.getTime())) return "—";
  return formatCNDateTime(raw);
};

export const getFileExtension = (filename?: string | null): string => {
  const parts = String(filename ?? "").split(".");
  if (parts.length <= 1) return "";
  return parts.pop()!.toLowerCase();
};

/**
 * MinIO-style absolute datetime: e.g. "Fri, Sep 26 2025 19:31 (GMT+8)".
 * Uses the user's local timezone.
 */
export const formatMinIODate = (raw?: string | null): string => {
  if (!raw) return "—";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "—";
  const weekday = WEEKDAY_EN[d.getDay()];
  const month = MONTH_EN[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  const offsetHour = Math.floor(absMin / 60);
  const offsetMinPart = absMin % 60;
  const tz = offsetMinPart === 0 ? `GMT${sign}${offsetHour}` : `GMT${sign}${offsetHour}:${String(offsetMinPart).padStart(2, "0")}`;
  return `${weekday}, ${month} ${day} ${year} ${hh}:${mm} (${tz})`;
};
