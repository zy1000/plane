export type TIssueLayoutContext = "create" | "edit" | "detail";
/** 每行放几个字段 */
export type TIssueLayoutColumns = 1 | 2 | 3 | 4 | 5;
/** 字段占几列；"full" 独占整行，不随每行字段数变化。列数达到每行字段数时按整行处理 */
export type TIssueLayoutWidth = 1 | 2 | 3 | 4 | "full";

export type TIssueFieldPlacement = {
  field_id: string;
  width: TIssueLayoutWidth;
  contexts: TIssueLayoutContext[];
};

/** 一块字段网格。根、页面、分组各有一块 */
export type TIssueLayoutArea = { columns: TIssueLayoutColumns; fields: TIssueFieldPlacement[] };

export type TIssueLayoutGroup = TIssueLayoutArea & {
  id: string;
  name: string;
  collapsible: boolean;
  default_collapsed: boolean;
};

/** 根或页面：不在分组里的字段排在最前，其后是分组 */
export type TIssueLayoutContainer = TIssueLayoutArea & { groups: TIssueLayoutGroup[] };

export type TIssueLayoutPage = TIssueLayoutContainer & { id: string; name: string };

/** 分组和页面都可以没有：根上的内容直接显示在描述下方，有页面时固定在页签上方 */
export type TIssueTypeFieldLayout = TIssueLayoutContainer & { version: 2; pages: TIssueLayoutPage[] };

/** 字段所在的那块网格 */
export type TIssueLayoutAreaRef = { kind: "root" } | { kind: "page"; id: string } | { kind: "group"; id: string };

// 旧版（version 1）：字段必须放在「页面 › 分组」里。只保留读取兼容，保存一律写新结构。
export type TLegacyIssueLayoutWidth = "auto" | "third" | "half" | "full";
export type TLegacyIssueLayoutGroup = {
  id: string;
  name: string;
  columns: 1 | 2 | 3;
  collapsible: boolean;
  default_collapsed: boolean;
  fields: { field_id: string; width: TLegacyIssueLayoutWidth; contexts: TIssueLayoutContext[] }[];
};
export type TLegacyIssueTypeFieldLayout = {
  version: 1;
  mode: "tabs" | "sections" | "sidebar";
  pages: { id: string; name: string; groups: TLegacyIssueLayoutGroup[] }[];
};
export type TStoredIssueTypeFieldLayout = TIssueTypeFieldLayout | TLegacyIssueTypeFieldLayout | Record<string, never>;
