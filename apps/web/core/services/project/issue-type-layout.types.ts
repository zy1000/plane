export type TIssueLayoutContext = "create" | "edit" | "detail";
export type TIssueLayoutWidth = "auto" | "third" | "half" | "full";

export type TIssueFieldPlacement = {
  field_id: string;
  width: TIssueLayoutWidth;
  contexts: TIssueLayoutContext[];
};

export type TIssueLayoutGroup = {
  id: string;
  name: string;
  columns: 1 | 2 | 3;
  collapsible: boolean;
  default_collapsed: boolean;
  fields: TIssueFieldPlacement[];
};

export type TIssueLayoutPage = { id: string; name: string; groups: TIssueLayoutGroup[] };
export type TIssueTypeFieldLayout = { version: 1; mode: "tabs"; pages: TIssueLayoutPage[] };
// 旧配置保留读取兼容；编辑和展示统一为顶部页签，页内按分组连续排列。
type TLegacyIssueTypeFieldLayout = Omit<TIssueTypeFieldLayout, "mode"> & { mode: "sections" | "sidebar" };
export type TStoredIssueTypeFieldLayout = TIssueTypeFieldLayout | TLegacyIssueTypeFieldLayout | Record<string, never>;
