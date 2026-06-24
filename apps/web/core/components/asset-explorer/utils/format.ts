import { formatCNDateTime } from "@/components/qa/cases/util";

const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"] as const;
const padDatePart = (value: number): string => String(value).padStart(2, "0");

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

export const formatMinIODate = (raw?: string | null): string => {
  if (!raw) return "—";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "—";
  const year = d.getFullYear();
  const month = padDatePart(d.getMonth() + 1);
  const day = padDatePart(d.getDate());
  const hour = padDatePart(d.getHours());
  const minute = padDatePart(d.getMinutes());
  const second = padDatePart(d.getSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};
