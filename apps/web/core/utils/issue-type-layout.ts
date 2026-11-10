import type { TIssueTypeExtraField } from "@plane/types";
import type {
  TIssueFieldPlacement,
  TIssueLayoutArea,
  TIssueLayoutAreaRef,
  TIssueLayoutColumns,
  TIssueLayoutContainer,
  TIssueLayoutContext,
  TIssueLayoutGroup,
  TIssueLayoutPage,
  TIssueLayoutWidth,
  TIssueTypeFieldLayout,
  TLegacyIssueLayoutGroup,
  TLegacyIssueTypeFieldLayout,
  TStoredIssueTypeFieldLayout,
} from "@/services/project/issue-type-layout.types";

export type TLayoutField = Pick<
  TIssueTypeExtraField,
  "id" | "name" | "field_type" | "options" | "is_required" | "is_active" | "sort_order"
>;
export const LAYOUT_CONTEXTS: TIssueLayoutContext[] = ["create", "edit", "detail"];
export const LAYOUT_COLUMN_OPTIONS: TIssueLayoutColumns[] = [1, 2, 3, 4, 5];
export const LAYOUT_DEFAULT_COLUMNS: TIssueLayoutColumns = 4;
export const LAYOUT_ROOT_AREA: TIssueLayoutAreaRef = { kind: "root" };

export const isLongLayoutField = (field: TLayoutField) =>
  field.field_type === "text" && (field.options?.mode === "paragraph" || field.options?.text_mode === "paragraph");

export const defaultPlacement = (field: TLayoutField): TIssueFieldPlacement => ({
  field_id: field.id,
  width: isLongLayoutField(field) ? "full" : 1,
  contexts: [...LAYOUT_CONTEXTS],
});

export const createLayoutGroup = (id: string, name: string): TIssueLayoutGroup => ({
  id,
  name,
  columns: LAYOUT_DEFAULT_COLUMNS,
  collapsible: true,
  default_collapsed: false,
  fields: [],
});

export const createLayoutPage = (id: string, name: string): TIssueLayoutPage => ({
  id,
  name,
  columns: LAYOUT_DEFAULT_COLUMNS,
  fields: [],
  groups: [],
});

/** 实际占几列：整行、或列数不小于每行字段数时，占满一行 */
export const layoutSpan = (width: TIssueLayoutWidth, columns: number) =>
  width === "full" ? columns : Math.min(width, columns);

export const layoutAreaKey = (ref: TIssueLayoutAreaRef) => (ref.kind === "root" ? "root" : `${ref.kind}:${ref.id}`);

export type TLayoutAreaEntry = {
  ref: TIssueLayoutAreaRef;
  area: TIssueLayoutArea;
  /** 「所在位置」里的叫法 */
  label: string;
  /** 所在页面；根上的内容为 null */
  pageId: string | null;
};

/** 布局里的每一块字段网格，按展示顺序：描述下方 → 根上的分组 → 各页面（页内未分组 → 页内分组） */
export function layoutAreas(layout: TIssueTypeFieldLayout): TLayoutAreaEntry[] {
  const of = (container: TIssueLayoutContainer, page?: TIssueLayoutPage): TLayoutAreaEntry[] => [
    {
      ref: page ? { kind: "page", id: page.id } : LAYOUT_ROOT_AREA,
      area: container,
      label: page ? page.name : "描述下方",
      pageId: page?.id ?? null,
    },
    ...container.groups.map(
      (group): TLayoutAreaEntry => ({
        ref: { kind: "group", id: group.id },
        area: group,
        label: page ? `${page.name} / ${group.name}` : group.name,
        pageId: page?.id ?? null,
      })
    ),
  ];
  return [...of(layout), ...layout.pages.flatMap((page) => of(page, page))];
}

export const findLayoutArea = (layout: TIssueTypeFieldLayout, ref: TIssueLayoutAreaRef) =>
  layoutAreas(layout).find((item) => layoutAreaKey(item.ref) === layoutAreaKey(ref));

/** 根和各页面：分组只能放在这两种容器里 */
export const layoutContainers = (
  layout: TIssueTypeFieldLayout
): { container: TIssueLayoutContainer; pageId: string | null }[] => [
  { container: layout, pageId: null },
  ...layout.pages.map((page) => ({ container: page, pageId: page.id })),
];

export const countLayoutGroups = (layout: TIssueTypeFieldLayout) =>
  layoutContainers(layout).reduce((sum, { container }) => sum + container.groups.length, 0);

/**
 * 旧版强制「页面 › 分组」。没改过名的默认一页一组等于「没有分组和页面」，摊平到描述下方；
 * 其余照原样保留成页面和分组。宽度从「三分之一 / 半行 / 整行」换成占几列。
 */
function upgradeLegacyLayout(saved: TLegacyIssueTypeFieldLayout): TIssueTypeFieldLayout {
  const upgradeGroup = (group: TLegacyIssueLayoutGroup): TIssueLayoutGroup => ({
    id: group.id,
    name: group.name,
    columns: group.columns,
    collapsible: group.collapsible,
    default_collapsed: group.default_collapsed,
    fields: group.fields.map((entry) => ({
      field_id: entry.field_id,
      width:
        entry.width === "full" || (entry.width === "half" && group.columns === 1)
          ? "full"
          : entry.width === "half" && group.columns === 3
            ? 2
            : 1,
      contexts: [...entry.contexts],
    })),
  });
  const [page] = saved.pages;
  const [group] = page?.groups ?? [];
  if (
    saved.pages.length === 1 &&
    page.groups.length === 1 &&
    page.id === "default" &&
    group.id === "default" &&
    page.name === "基本信息" &&
    group.name === "自定义字段"
  ) {
    const { columns, fields } = upgradeGroup(group);
    return { version: 2, columns, fields, groups: [], pages: [] };
  }
  return {
    version: 2,
    columns: LAYOUT_DEFAULT_COLUMNS,
    fields: [],
    groups: [],
    pages: saved.pages.map((item) => ({
      id: item.id,
      name: item.name,
      columns: LAYOUT_DEFAULT_COLUMNS,
      fields: [],
      groups: item.groups.map(upgradeGroup),
    })),
  };
}

/**
 * 把存下来的布局对到当前字段上：去掉已删除的字段，必填字段保证创建和编辑时可见，
 * 布局里没有的字段（保存之后才加的）补到描述下方末尾。没存过布局时，全部字段直接排在描述下方。
 */
export function resolveIssueTypeLayout(
  saved: TStoredIssueTypeFieldLayout | undefined,
  fields: TLayoutField[]
): TIssueTypeFieldLayout {
  // eslint-disable-next-line unicorn/no-array-sort -- ES2020 target; sort a copy without mutating the input.
  const ordered = [...fields].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const stored = saved as TIssueTypeFieldLayout | TLegacyIssueTypeFieldLayout | undefined;
  const base =
    stored?.version === 2 && Array.isArray(stored.fields) && Array.isArray(stored.groups) && Array.isArray(stored.pages)
      ? stored
      : stored?.version === 1 && Array.isArray(stored.pages)
        ? upgradeLegacyLayout(stored)
        : undefined;
  if (!base) {
    return { version: 2, columns: LAYOUT_DEFAULT_COLUMNS, fields: ordered.map(defaultPlacement), groups: [], pages: [] };
  }
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const placed = new Set<string>();
  const placements = (entries: TIssueFieldPlacement[]) =>
    entries
      .filter((entry) => {
        if (!fieldMap.has(entry.field_id) || placed.has(entry.field_id)) return false;
        placed.add(entry.field_id);
        return true;
      })
      .map((entry): TIssueFieldPlacement => {
        const field = fieldMap.get(entry.field_id);
        const contexts =
          field?.is_required && field.is_active !== false
            ? LAYOUT_CONTEXTS.filter((context) => context !== "detail" || entry.contexts.includes(context))
            : [...entry.contexts];
        return { field_id: entry.field_id, width: entry.width, contexts };
      });
  const groupsOf = (groups: TIssueLayoutGroup[]) =>
    groups.map((group) => ({ ...group, fields: placements(group.fields) }));
  const layout: TIssueTypeFieldLayout = {
    version: 2,
    columns: base.columns,
    fields: placements(base.fields),
    groups: groupsOf(base.groups),
    pages: base.pages.map((page) => ({ ...page, fields: placements(page.fields), groups: groupsOf(page.groups) })),
  };
  layout.fields.push(...ordered.filter((field) => !placed.has(field.id)).map(defaultPlacement));
  return layout;
}

/** 某个场景下实际要展示的布局：按显示场景筛字段，去掉筛完没有字段的分组和页面 */
export function layoutForContext(
  layout: TIssueTypeFieldLayout,
  fields: TLayoutField[],
  context: TIssueLayoutContext,
  errorFieldIds: string[] = []
): TIssueTypeFieldLayout {
  const fieldMap = new Map(fields.filter((field) => field.is_active !== false).map((field) => [field.id, field]));
  const visible = (entries: TIssueFieldPlacement[]) =>
    entries.filter((entry) => {
      const field = fieldMap.get(entry.field_id);
      // 字段库后续把字段改成必填时，旧布局也必须保证创建和编辑可达。
      return (
        field &&
        (entry.contexts.includes(context) ||
          errorFieldIds.includes(entry.field_id) ||
          (context !== "detail" && field.is_required))
      );
    });
  const groupsOf = (groups: TIssueLayoutGroup[]) =>
    groups.map((group) => ({ ...group, fields: visible(group.fields) })).filter((group) => group.fields.length);
  return {
    version: 2,
    columns: layout.columns,
    fields: visible(layout.fields),
    groups: groupsOf(layout.groups),
    pages: layout.pages
      .map((page) => ({ ...page, fields: visible(page.fields), groups: groupsOf(page.groups) }))
      .filter((page) => page.fields.length || page.groups.length),
  };
}

// 容器越窄，一行放得越少：不足 28rem 一列，之后每过一档多一列，直到设定的每行字段数。
const GRID_COLUMN_CLASSES = [
  "grid-cols-1",
  "@md/layout:grid-cols-2",
  "@2xl/layout:grid-cols-3",
  "@4xl/layout:grid-cols-4",
  "@5xl/layout:grid-cols-5",
];
const FIELD_SPAN_CLASSES = [
  ["col-span-1"],
  ["@md/layout:col-span-1", "@md/layout:col-span-2"],
  ["@2xl/layout:col-span-1", "@2xl/layout:col-span-2", "@2xl/layout:col-span-3"],
  ["@4xl/layout:col-span-1", "@4xl/layout:col-span-2", "@4xl/layout:col-span-3", "@4xl/layout:col-span-4"],
  [
    "@5xl/layout:col-span-1",
    "@5xl/layout:col-span-2",
    "@5xl/layout:col-span-3",
    "@5xl/layout:col-span-4",
    "@5xl/layout:col-span-5",
  ],
];

/** 展示端的网格列数（随容器宽度收窄），需放在 `@container/layout` 里 */
export const layoutGridClass = (columns: number) => GRID_COLUMN_CLASSES.slice(0, columns).join(" ");

/** 展示端字段占的列数：每一档都不超过那一档的列数 */
export function layoutFieldClass(width: TIssueLayoutWidth, columns: number): string {
  if (width === "full" || width >= columns) return "col-span-full";
  return FIELD_SPAN_CLASSES.slice(0, columns)
    .map((options, index) => options[Math.min(width, index + 1) - 1])
    .join(" ");
}

export type TLayoutGridCell =
  | { kind: "field"; entry: TIssueFieldPlacement; span: number }
  /** 一行里放不下后面那个字段而空出来的格子；beforeId 是它后面的字段，末行没有 */
  | { kind: "slot"; key: string; beforeId?: string };

/** 设计器画布：按网格自动排布的顺序，在字段之间补上空出来的格子 */
export function layoutGridCells(area: TIssueLayoutArea): TLayoutGridCell[] {
  const cells: TLayoutGridCell[] = [];
  let cursor = 0;
  const pad = (beforeId?: string) => {
    for (; cursor > 0 && cursor < area.columns; cursor++)
      cells.push({ kind: "slot", key: `${beforeId ?? "end"}:${cursor}`, beforeId });
    cursor = 0;
  };
  for (const entry of area.fields) {
    const span = layoutSpan(entry.width, area.columns);
    if (span > area.columns - cursor) pad(entry.field_id);
    cells.push({ kind: "field", entry, span });
    cursor = (cursor + span) % area.columns;
  }
  pad();
  return cells;
}

export function moveLayoutField(
  layout: TIssueTypeFieldLayout,
  fieldId: string,
  target: TIssueLayoutAreaRef,
  beforeId?: string
) {
  if (fieldId === beforeId) return layout;
  const next = structuredClone(layout);
  const areas = layoutAreas(next);
  let placement: TIssueFieldPlacement | undefined;
  for (const { area } of areas) {
    placement ??= area.fields.find((entry) => entry.field_id === fieldId);
    area.fields = area.fields.filter((entry) => entry.field_id !== fieldId);
  }
  const destination = areas.find((item) => layoutAreaKey(item.ref) === layoutAreaKey(target))?.area;
  if (!destination || !placement) return layout;
  const index = destination.fields.findIndex((entry) => entry.field_id === beforeId);
  destination.fields.splice(index < 0 ? destination.fields.length : index, 0, placement);
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
