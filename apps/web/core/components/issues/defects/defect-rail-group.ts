import { ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";
import type { IIssueDisplayFilterOptions, TIssueGroupByOptions } from "@plane/types";

/**
 * 缺陷页左栏的分组维度：选项、名字、顺序都跟工作项「显示 › 分组方式」一致，
 * 外加一个默认的「快捷筛选」（九个固定口径，存为 null）。左栏用 getGroupByColumns 取每组的名字和图标。
 */
export type TDefectRailGroupBy = Exclude<TIssueGroupByOptions, null>;

/** 工作项列表布局的分组选项（不含「无」） */
export const DEFECT_RAIL_GROUP_BY_KEYS: TDefectRailGroupBy[] = (
  ISSUE_DISPLAY_FILTERS_BY_PAGE.defects?.layoutOptions?.list?.display_filters?.group_by ?? []
).filter((key): key is TDefectRailGroupBy => key !== null);

export const DEFECT_QUICK_FILTER_LABEL = "快捷筛选";

/** 存在 displayFilters 里，随视图一起保存；快捷筛选存 null（与没设过的旧视图视为同一回事） */
export const DEFECT_RAIL_GROUP_KEY = "rail_group_by";

export type TDefectDisplayFilters = IIssueDisplayFilterOptions & {
  [DEFECT_RAIL_GROUP_KEY]?: TDefectRailGroupBy | null;
};

export const getDefectRailGroupBy = (displayFilters: IIssueDisplayFilterOptions | undefined): TDefectRailGroupBy | null => {
  const value = (displayFilters as TDefectDisplayFilters | undefined)?.[DEFECT_RAIL_GROUP_KEY];
  return value && DEFECT_RAIL_GROUP_BY_KEYS.includes(value) ? value : null;
};

export const NONE_GROUP_ID = "None";

/**
 * 分组模式下选中的值写进 URL `?group=维度:值`。带上维度，切了维度（或切到分组维度不同的视图）
 * 旧值自然失效，不用另外清 URL。
 */
export const DEFECT_GROUP_VALUE_PARAM = "group";

export const encodeGroupValue = (groupBy: TDefectRailGroupBy, groupId: string) => `${groupBy}:${groupId}`;

export const decodeGroupValue = (value: string | null, groupBy: TDefectRailGroupBy | null): string | null => {
  if (!value || !groupBy) return null;
  const prefix = `${groupBy}:`;
  return value.startsWith(prefix) ? value.slice(prefix.length) || null : null;
};

/** 每个维度对应的筛选字段（与 IssueFilterSet 一致）；状态按名字选，另行解析成 state_id */
const GROUP_FILTER_FIELDS: Partial<Record<TDefectRailGroupBy, string>> = {
  "state_detail.group": "state_group",
  priority: "priority",
  cycle: "cycle_id",
  module: "module_id",
  release: "release_id",
  product: "product_id",
  product_module: "product_module_id",
  stage: "stage_id",
  labels: "label_id",
  assignees: "assignee_id",
  created_by: "created_by_id",
};

type TConditionItem = Record<string, string | boolean | number>;

/** 项目里没有对应状态时用一个不存在的 id，让列表为空，而不是退化成不过滤 */
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

/**
 * 选中的分组值 → 注入列表的条件。
 * @param stateIdsByName 状态组按名字合并（同名状态分属不同缺陷类型），这里给出该名字对应的缺陷状态 id
 */
export function getGroupValueConditions(
  groupBy: TDefectRailGroupBy,
  groupId: string,
  stateIdsByName: (name: string) => string[]
): TConditionItem[] {
  if (groupBy === "state") {
    const ids = stateIdsByName(groupId);
    return [{ state_id__in: (ids.length > 0 ? ids : [NO_MATCH_ID]).join(",") }];
  }
  const field = GROUP_FILTER_FIELDS[groupBy];
  if (!field) return [];
  if (groupId === NONE_GROUP_ID) return [{ [`${field}__isnull`]: true }];
  return [{ [`${field}__in`]: groupId }];
}
