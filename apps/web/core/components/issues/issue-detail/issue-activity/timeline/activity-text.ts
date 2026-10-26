import { useTranslation } from "@plane/i18n";
import type { TIssueActivity } from "@plane/types";
import { renderFormattedDate } from "@plane/utils";

const I18N = "issue_activity";

/** 有固定中文名的字段；extra_field 用记录里的 comment（字段名），其余退回 field 本身 */
const LABELED_FIELDS = new Set([
  "name",
  "description",
  "state",
  "priority",
  "assignees",
  "labels",
  "start_date",
  "target_date",
  "parent",
  "cycles",
  "modules",
  "releases",
  "link",
  "attachment",
  "product",
  "product_module",
  "type",
]);

export const RELATION_FIELDS = [
  "relates_to",
  "duplicate",
  "blocked_by",
  "blocking",
  "start_before",
  "start_after",
  "finish_before",
  "finish_after",
  "implements",
  "implemented_by",
];

/** 迭代 / 模块 / 发布：verb 记的是加入 / 改到 / 移出 */
export const COLLECTION_FIELDS = ["cycles", "modules", "releases"];
export const DATE_FIELDS = ["start_date", "target_date"];
const PRIORITIES = ["urgent", "high", "medium", "low"];

/** 标题、描述总是走行内 diff；自定义字段两头都有值且任一头超过这个长度也走 diff，短的枚举值仍是「旧 → 新」 */
const TEXT_DIFF_LENGTH = 20;

export const isRelationField = (field: string | undefined) => !!field && RELATION_FIELDS.includes(field);

export const isTextDiffActivity = (activity: TIssueActivity) => {
  const field = activity.field ?? "";
  if (field === "name" || field === "description") return true;
  if (field !== "extra_field") return false;
  const oldValue = activity.old_value ?? "";
  const newValue = activity.new_value ?? "";
  return !!oldValue && !!newValue && (oldValue.length > TEXT_DIFF_LENGTH || newValue.length > TEXT_DIFF_LENGTH);
};

/** 由关联需求自动带出的产品 / 产品模块（后端 comment 固定写 auto-filled） */
export const isAutoFilledFromRequirement = (activity: TIssueActivity) =>
  (activity.field === "product" || activity.field === "product_module") && !!activity.comment?.includes("auto-filled");

export const useActivityFieldLabel = () => {
  const { t } = useTranslation();
  return (activity: TIssueActivity) => {
    const field = activity.field ?? "";
    if (field === "extra_field") return activity.comment || t(`${I18N}.fields.field`);
    if (field.startsWith("estimate")) return t(`${I18N}.fields.estimate`);
    if (isRelationField(field)) return t(`${I18N}.fields.relation`);
    if (LABELED_FIELDS.has(field)) return t(`${I18N}.fields.${field}`);
    return field;
  };
};

/** 句子里的值：优先级翻成中文、日期按语言排版，其它原样 */
export const useActivityDisplayValue = () => {
  const { t, currentLocale } = useTranslation();
  return (activity: TIssueActivity, value: string) => {
    const field = activity.field ?? "";
    if (field === "priority") {
      const normalized = value.toLowerCase();
      if (PRIORITIES.includes(normalized)) return t(`issue.priority.${normalized}`);
      return t(`${I18N}.none`);
    }
    if (DATE_FIELDS.includes(field)) {
      const formatted = currentLocale.toLowerCase().startsWith("zh")
        ? renderFormattedDate(value, "yyyy年M月d日")
        : renderFormattedDate(value);
      return formatted ?? value;
    }
    return value;
  };
};
