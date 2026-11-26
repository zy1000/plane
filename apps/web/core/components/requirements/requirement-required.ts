import type { TRequirementField, TRequirementValue } from "@plane/types";
import { sanitizeHTML } from "@plane/utils";

/**
 * 一个自定义字段的值算不算「空」。口径与后端 serializers/requirement.py 的
 * enforce_required 完全一致：null / "" / [] 为空，富文本去掉标签后只剩空白也为空；
 * boolean 的 false 不算空。子表（form）的值是行数组，空数组 = 一行都没有。
 *
 * 建行弹窗靠它决定保存按钮与底部「还差什么」，字段随需求类型配置走，这里不认字段名。
 */
export const isRequirementValueEmpty = (field: TRequirementField, value: TRequirementValue | undefined): boolean => {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  // 动态取值在规则写成「富文本」时存的也是 HTML；普通取值过一遍清洗不受影响
  if ((field.field_type === "rich_text" || field.field_type === "rule_value") && typeof value === "string") {
    return !sanitizeHTML(value).trim();
  }
  // 取值规则的值是 { expr, multiple, allow_custom }，规则原文为空就算没填
  if (typeof value === "object") return !String((value as { expr?: unknown }).expr ?? "").trim();
  return false;
};
