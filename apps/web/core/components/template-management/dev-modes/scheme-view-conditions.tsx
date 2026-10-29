import type { TSchemeView } from "@plane/types";

/** 条件里的属性名（与工作项筛选器的叫法一致） */
const FIELD_LABELS: Record<string, string> = {
  type_id: "类型",
  state_id: "状态",
  state_group: "状态组",
  priority: "优先级",
  assignee_id: "负责人",
  mention_id: "提及",
  created_by_id: "创建者",
  start_date: "开始日期",
  target_date: "结束日期",
  created_at: "创建日期",
  updated_at: "更新日期",
  name: "标题",
  product_id: "产品",
  product_module_id: "产品模块",
  stage_id: "阶段",
};

const OPERATOR_LABELS: Record<string, string> = {
  in: "属于",
  not_in: "不属于",
  exact: "是",
  not_exact: "不是",
  contains: "包含",
  not_contains: "不包含",
  range: "介于",
  not_range: "不介于",
  lt: "早于",
  lte: "不晚于",
  gt: "晚于",
  gte: "不早于",
};

const PRIORITY_LABELS: Record<string, string> = { urgent: "紧急", high: "高", medium: "中", low: "低", none: "无" };

const STATE_GROUP_LABELS: Record<string, string> = {
  backlog: "待办",
  unstarted: "未开始",
  started: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

/** 一行最多列出的值，多的写「等 N 个」 */
const MAX_LISTED_VALUES = 2;

export type TConditionNameResolvers = {
  getTypeName: (id: string) => string | undefined;
  getStateName: (id: string) => string | undefined;
  getUserName: (id: string) => string | undefined;
};

export type TViewCondition = { key: string; field: string; operator: string; value: string };

const collectLeaves = (expression: unknown, leaves: [string, unknown][]) => {
  if (!expression || typeof expression !== "object") return;
  Object.entries(expression as Record<string, unknown>).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((child) => collectLeaves(child, leaves));
    else if (value && typeof value === "object") collectLeaves(value, leaves);
    else leaves.push([key, value]);
  });
};

const resolveValue = (field: string, raw: string, resolvers: TConditionNameResolvers): string => {
  if (field === "type_id") return resolvers.getTypeName(raw) ?? "已删除的类型";
  if (field === "state_id") return resolvers.getStateName(raw) ?? "已删除的状态";
  if (field === "state_group") return STATE_GROUP_LABELS[raw] ?? raw;
  if (field === "priority") return PRIORITY_LABELS[raw] ?? raw;
  if (field === "assignee_id" || field === "mention_id" || field === "created_by_id")
    return resolvers.getUserName(raw) ?? "未知成员";
  return raw;
};

/** 把视图的富筛选拆成一条条「属性 · 操作符 · 值」，值里的 id 换成名字 */
export const describeViewConditions = (view: TSchemeView, resolvers: TConditionNameResolvers): TViewCondition[] => {
  const leaves: [string, unknown][] = [];
  collectLeaves(view.rich_filters, leaves);
  return leaves.map(([key, rawValue]) => {
    const separator = key.lastIndexOf("__");
    const field = separator > 0 ? key.slice(0, separator) : key;
    const operator = separator > 0 ? key.slice(separator + 2) : "exact";
    const values = String(rawValue ?? "")
      .split(",")
      .filter(Boolean);
    const isIdList = field === "product_id" || field === "product_module_id" || field === "stage_id";
    const names = isIdList ? [] : values.map((value) => resolveValue(field, value, resolvers));
    const listed = names.slice(0, MAX_LISTED_VALUES).join("、");
    const value = isIdList
      ? `${values.length} 个`
      : names.length > MAX_LISTED_VALUES
        ? `${listed} 等 ${names.length} 个`
        : listed;
    return {
      key,
      field: FIELD_LABELS[field] ?? field,
      operator: OPERATOR_LABELS[operator] ?? operator,
      value,
    };
  });
};

/** 「属性 | 操作符 值」小条 */
export const ViewConditionChip = ({ condition }: { condition: TViewCondition }) => (
  <span className="inline-flex h-6 shrink-0 items-center overflow-hidden rounded-[5px] border border-subtle bg-surface-1 text-12 whitespace-nowrap">
    <span className="flex h-full items-center border-r border-subtle bg-layer-1 px-1.5 text-secondary">
      {condition.field}
    </span>
    <span className="pl-1.5 text-tertiary">{condition.operator}</span>
    <span className="px-1.5 font-medium text-primary">{condition.value}</span>
  </span>
);
