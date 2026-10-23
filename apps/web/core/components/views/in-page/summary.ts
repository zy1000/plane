import type { IFilterInstance } from "@plane/shared-state";
import { LOGICAL_OPERATOR } from "@plane/types";
import type { TExternalFilter, TFilterProperty } from "@plane/types";
import type { TViewSnapshot, TViewSummaryRow } from "./types";

/** 显示字段一行最多列出的个数，多的写「等 N 项」 */
const MAX_LISTED_PROPERTIES = 4;

const DISPLAY_PROPERTY_LABELS: Record<string, string> = {
  key: "编号",
  issue_type: "类型",
  state: "状态",
  priority: "优先级",
  assignee: "负责人",
  labels: "标签",
  start_date: "开始日期",
  due_date: "截止日期",
  estimate: "估算",
  sub_issue_count: "子工作项",
  link: "链接",
  attachment_count: "附件",
  created_on: "创建时间",
  updated_on: "更新时间",
  modules: "模块",
  cycle: "迭代",
  release: "发布",
  product: "产品",
  product_module: "产品模块",
};

const GROUP_BY_LABELS: Record<string, string> = {
  state: "状态",
  "state_detail.group": "状态组",
  priority: "优先级",
  labels: "标签",
  assignees: "负责人",
  created_by: "创建人",
  cycle: "迭代",
  module: "模块",
  release: "发布",
  product: "产品",
  product_module: "产品模块",
  issue_type: "类型",
  target_date: "截止日期",
  project: "项目",
};

const ORDER_BY_LABELS: Record<string, string> = {
  sort_order: "手动",
  "-created_at": "创建时间",
  "-updated_at": "更新时间",
  start_date: "开始日期",
  "-priority": "优先级",
  target_date: "截止日期",
};

const LAYOUT_LABELS: Record<string, string> = {
  list: "列表",
  kanban: "看板",
  calendar: "日历",
  spreadsheet: "表格",
  gantt_chart: "时间线",
};

/** 富筛选表达式里的条件条数：AND 组按子项数，单条件算 1 */
export const countFilterConditions = (expression: unknown): number => {
  if (!expression || typeof expression !== "object") return 0;
  const record = expression as Record<string, unknown>;
  const andGroup = record[LOGICAL_OPERATOR.AND];
  if (Array.isArray(andGroup)) return andGroup.length;
  return Object.keys(record).length > 0 ? 1 : 0;
};

/** 当前筛选用到的属性名（去重，按出现顺序），给「会记住这些设置」的筛选行 */
export const getFilterPropertyLabels = <P extends TFilterProperty, E extends TExternalFilter>(
  filter: IFilterInstance<P, E> | undefined
): string[] => {
  if (!filter) return [];
  const labels = filter.allConditionsForDisplay
    .map((condition) => filter.configManager.getConfigByProperty(condition.property)?.label)
    .filter((label): label is string => !!label);
  return Array.from(new Set(labels));
};

/** 筛选行：属性名做 chip，文字写条件数 */
export const getFilterSummaryRow = (expression: unknown, filterLabels: string[]): TViewSummaryRow => {
  const conditionCount = countFilterConditions(expression);
  return {
    kind: "filters",
    label: "筛选",
    text: conditionCount > 0 ? `共 ${conditionCount} 个条件` : "无，看全部",
    chips: conditionCount > 0 ? filterLabels : [],
  };
};

/** 工作项 / 缺陷页「存为视图」弹窗里的摘要 */
export const getWorkItemViewSummary = (snapshot: TViewSnapshot, filterLabels: string[] = []): TViewSummaryRow[] => {
  const properties = Object.entries(snapshot.display_properties ?? {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => DISPLAY_PROPERTY_LABELS[key] ?? key);
  const displayFilters = (snapshot.display_filters ?? {}) as Record<string, unknown>;
  const groupBy = displayFilters.group_by as string | null | undefined;
  const orderBy = displayFilters.order_by as string | undefined;
  const layout = displayFilters.layout as string | undefined;
  const arrangement = [
    layout ? (LAYOUT_LABELS[layout] ?? layout) : null,
    groupBy ? `按${GROUP_BY_LABELS[groupBy] ?? groupBy}分组` : "不分组",
    orderBy ? `按${ORDER_BY_LABELS[orderBy] ?? orderBy}排序` : null,
  ].filter(Boolean);
  const listed = properties.slice(0, MAX_LISTED_PROPERTIES).join("、");
  const propertiesText =
    properties.length === 0
      ? "全部"
      : properties.length > MAX_LISTED_PROPERTIES
        ? `${listed} 等 ${properties.length} 项`
        : listed;

  return [
    getFilterSummaryRow(snapshot.rich_filters, filterLabels),
    { kind: "layout", label: "布局", text: arrangement.join(" · ") },
    { kind: "properties", label: "显示字段", text: propertiesText },
  ];
};
