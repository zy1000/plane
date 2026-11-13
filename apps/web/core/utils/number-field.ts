/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 数字字段的显示格式与取值范围，与后端 plane/utils/number_field.py 同口径：
 * `options.number_format / precision / unit` 管显示，`validation.min / max` 管取值范围。
 * 存的始终是填写的数（百分比填 15 即 15%）。
 */

export type TNumberFormat = "number" | "percent" | "currency";

export type TNumberFieldConfig = {
  format: TNumberFormat;
  /** 小数位数；null = 不限 */
  precision: number | null;
  /** 跟在值后面的单位；百分比固定为 % */
  unit: string;
  min: number | null;
  max: number | null;
};

export const NUMBER_PRECISION_MAX = 6;
export const NUMBER_UNIT_MAX_LENGTH = 20;

export const NUMBER_FORMAT_OPTIONS: { key: TNumberFormat; label: string }[] = [
  { key: "number", label: "数值" },
  { key: "percent", label: "百分比" },
  { key: "currency", label: "金额" },
];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getNumberFieldConfig = (field: { options?: unknown; validation?: unknown }): TNumberFieldConfig => {
  const options = asRecord(field.options);
  const validation = asRecord(field.validation);
  const format: TNumberFormat =
    options.number_format === "percent" || options.number_format === "currency" ? options.number_format : "number";
  const precision = options.precision;
  return {
    format,
    precision:
      typeof precision === "number" && Number.isInteger(precision) && precision >= 0 && precision <= NUMBER_PRECISION_MAX
        ? precision
        : null,
    unit: format === "percent" ? "%" : typeof options.unit === "string" ? options.unit.trim() : "",
    min: toFiniteNumber(validation.min),
    max: toFiniteNumber(validation.max),
  };
};

/** 数字字段值的展示文案：按小数位数补零，金额带千分位，后面跟单位。不是数字时原样返回 */
export const formatNumberFieldValue = (value: unknown, config: TNumberFieldConfig): string => {
  const number = toFiniteNumber(value);
  if (number === null) return value === null || value === undefined ? "" : String(value);
  let text = config.precision === null ? String(number) : number.toFixed(config.precision);
  if (config.format === "currency") {
    const [integer, fraction] = text.split(".");
    text = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction === undefined ? "" : `.${fraction}`);
  }
  if (!config.unit) return text;
  return config.format === "percent" ? `${text}%` : `${text} ${config.unit}`;
};

/** 超出取值范围时的提示，范围内返回 null */
export const getNumberRangeError = (value: number, config: Pick<TNumberFieldConfig, "min" | "max">): string | null => {
  if (config.min !== null && value < config.min) return `不能小于 ${config.min}`;
  if (config.max !== null && value > config.max) return `不能大于 ${config.max}`;
  return null;
};

/** 字段配置的一行摘要，如「百分比 · 1 位小数 · 0 ~ 100」；全是缺省值返回空串 */
export const getNumberConfigSummary = (config: TNumberFieldConfig): string => {
  const { format, precision, unit, min, max } = config;
  const range =
    min !== null && max !== null ? `${min} ~ ${max}` : min !== null ? `≥ ${min}` : max !== null ? `≤ ${max}` : "";
  return [
    format === "number" ? "" : (NUMBER_FORMAT_OPTIONS.find((option) => option.key === format)?.label ?? ""),
    precision === null ? "" : precision === 0 ? "整数" : `${precision} 位小数`,
    format !== "percent" && unit ? `单位 ${unit}` : "",
    range,
  ]
    .filter(Boolean)
    .join(" · ");
};
