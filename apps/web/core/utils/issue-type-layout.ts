import type { TIssueTypeExtraField } from "@plane/types";
import type {
  TIssueFieldPlacement,
  TIssueLayoutContext,
  TIssueLayoutGroup,
  TIssueLayoutPage,
  TIssueLayoutWidth,
  TIssueTypeFieldLayout,
  TStoredIssueTypeFieldLayout,
} from "@/services/project/issue-type-layout.types";

export type TLayoutField = Pick<
  TIssueTypeExtraField,
  "id" | "name" | "field_type" | "options" | "is_required" | "is_active" | "sort_order"
>;
export const LAYOUT_CONTEXTS: TIssueLayoutContext[] = ["create", "edit", "detail"];

export const isLongLayoutField = (field: TLayoutField) =>
  field.field_type === "text" && (field.options?.mode === "paragraph" || field.options?.text_mode === "paragraph");

export const defaultPlacement = (field: TLayoutField): TIssueFieldPlacement => ({
  field_id: field.id,
  width: isLongLayoutField(field) ? "full" : "auto",
  contexts: [...LAYOUT_CONTEXTS],
});

export const createLayoutGroup = (id: string, name: string, fields: TLayoutField[] = []): TIssueLayoutGroup => ({
  id,
  name,
  columns: 2,
  collapsible: true,
  default_collapsed: false,
  fields: fields.map(defaultPlacement),
});

export function resolveIssueTypeLayout(
  saved: TStoredIssueTypeFieldLayout | undefined,
  fields: TLayoutField[],
  includeUnassigned = true
): TIssueTypeFieldLayout {
  // eslint-disable-next-line unicorn/no-array-sort -- ES2020 target; sort a copy without mutating the input.
  const ordered = [...fields].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (!saved || saved.version !== 1 || !Array.isArray(saved.pages)) {
    return {
      version: 1,
      mode: "tabs",
      pages: [{ id: "default", name: "基本信息", groups: [createLayoutGroup("default", "自定义字段", ordered)] }],
    };
  }
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const placed = new Set<string>();
  const pages = saved.pages.map((page) => ({
    ...page,
    groups: page.groups.map((group) => ({
      ...group,
      fields: group.fields
        .filter((entry) => {
          if (!fieldMap.has(entry.field_id) || placed.has(entry.field_id)) return false;
          placed.add(entry.field_id);
          return true;
        })
        .map((entry) => {
          const field = fieldMap.get(entry.field_id);
          const contexts =
            field?.is_required && field.is_active !== false
              ? LAYOUT_CONTEXTS.filter((context) => context !== "detail" || entry.contexts.includes(context))
              : [...entry.contexts];
          return { field_id: entry.field_id, width: entry.width, contexts };
        }),
    })),
  }));
  const unassigned = ordered.filter((field) => !placed.has(field.id));
  if (includeUnassigned && unassigned.length) {
    pages.push({
      id: "__unassigned",
      name: "未分组",
      groups: [createLayoutGroup("__unassigned", "未分组字段", unassigned)],
    });
  }
  return { version: 1, mode: "tabs", pages };
}

export function layoutFieldsForContext(
  layout: TIssueTypeFieldLayout,
  fields: TLayoutField[],
  context: TIssueLayoutContext,
  errorFieldIds: string[] = []
): TIssueLayoutPage[] {
  const fieldMap = new Map(fields.filter((field) => field.is_active !== false).map((field) => [field.id, field]));
  return layout.pages
    .map((page) => ({
      ...page,
      groups: page.groups
        .map((group) => ({
          ...group,
          fields: group.fields.filter((entry) => {
            const field = fieldMap.get(entry.field_id);
            // 字段库后续把字段改成必填时，旧布局也必须保证创建和编辑可达。
            return (
              field &&
              (entry.contexts.includes(context) ||
                errorFieldIds.includes(entry.field_id) ||
                (context !== "detail" && field.is_required))
            );
          }),
        }))
        .filter((group) => group.fields.length),
    }))
    .filter((page) => page.groups.length);
}

export function layoutFieldSpan(width: TIssueLayoutWidth, columns: 1 | 2 | 3, responsive = true): string {
  if (width === "full" || (width === "auto" && columns === 1)) return "col-span-6";
  if (!responsive) return width === "half" || (width === "auto" && columns === 2) ? "col-span-3" : "col-span-2";
  if (width === "half" || (width === "auto" && columns === 2)) return "col-span-6 @md/layout:col-span-3";
  return "col-span-6 @md/layout:col-span-3 @2xl/layout:col-span-2";
}

export function moveLayoutField(layout: TIssueTypeFieldLayout, fieldId: string, groupId: string, beforeId?: string) {
  const next = structuredClone(layout);
  let placement: TIssueFieldPlacement | undefined;
  for (const page of next.pages)
    for (const group of page.groups) {
      placement ??= group.fields.find((field) => field.field_id === fieldId);
      group.fields = group.fields.filter((field) => field.field_id !== fieldId);
    }
  const target = next.pages.flatMap((page) => page.groups).find((group) => group.id === groupId);
  if (!target || !placement) return layout;
  const index = target.fields.findIndex((field) => field.field_id === beforeId);
  target.fields.splice(index < 0 ? target.fields.length : index, 0, placement);
  return next;
}

/** 保存失败时，详情会话和字段布局之间只传递错误定位信息。 */
export const ISSUE_LAYOUT_VALIDATE_EVENT = "plane:issue-layout:validate";
export const ISSUE_LAYOUT_ERROR_EVENT = "plane:issue-layout:error";

export function getIssueLayoutErrors(error: unknown): Record<string, string> {
  if (!error || typeof error !== "object") return {};
  const payload = error as { extra_field_values?: Record<string, unknown> };
  if (
    !payload.extra_field_values ||
    typeof payload.extra_field_values !== "object" ||
    Array.isArray(payload.extra_field_values)
  )
    return {};
  return Object.fromEntries(
    Object.entries(payload.extra_field_values).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join("；") : String(value),
    ])
  );
}

export function notifyIssueLayoutError(issueId: string, error: unknown) {
  const errors = getIssueLayoutErrors(error);
  if (Object.keys(errors).length)
    window.dispatchEvent(new CustomEvent(ISSUE_LAYOUT_ERROR_EVENT, { detail: { issueId, errors } }));
}
