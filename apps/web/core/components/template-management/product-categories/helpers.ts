import type { TProductCategoryModuleSkipReason } from "@plane/types";
import { PRODUCT_CATEGORY_MODULE_NAME_MAX_LENGTH } from "@plane/types";

type TTranslate = (key: string, params?: Record<string, unknown>) => string;

/** 400 的重名错误码翻成人话；其余取后端的 error / detail，再兜底通用文案 */
export const getProductCategoryErrorMessage = (error: unknown, t: TTranslate) => {
  const payload = error as { name?: string[]; error?: string; detail?: string } | undefined;
  const code = payload?.name?.[0] ?? payload?.error;
  if (code === "PRODUCT_CATEGORY_NAME_ALREADY_EXISTS") return t("product_categories.errors.category_name_exists");
  if (code === "PRODUCT_CATEGORY_MODULE_NAME_ALREADY_EXISTS") return t("product_categories.errors.module_name_exists");
  return code ?? payload?.detail ?? t("product_categories.errors.generic");
};

export const includesQuery = (value: string, query: string) =>
  value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());

export type TBulkModulePreview = {
  toAdd: string[];
  skipped: { name: string; reason: TProductCategoryModuleSkipReason }[];
};

/**
 * 批量添加的本地预览，口径与后端 bulk_add_category_modules 一致：
 * 去首尾空格、丢空行；超过 30 字、分类里已有、本次重复的跳过。
 */
export const previewBulkModules = (raw: string, existingNames: string[]): TBulkModulePreview => {
  const existing = new Set(existingNames);
  const seen = new Set<string>();
  const toAdd: string[] = [];
  const skipped: TBulkModulePreview["skipped"] = [];
  for (const line of raw.split(/\r?\n/)) {
    const name = line.trim();
    if (!name) continue;
    if (name.length > PRODUCT_CATEGORY_MODULE_NAME_MAX_LENGTH) skipped.push({ name, reason: "too_long" });
    else if (existing.has(name)) skipped.push({ name, reason: "exists" });
    else if (seen.has(name)) skipped.push({ name, reason: "duplicate" });
    else toAdd.push(name);
    seen.add(name);
  }
  return { toAdd, skipped };
};
