/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 工时类别前端统一常量。
 *
 * - 类别字典由后端下发（GET /api/timesheet-categories/），包含 id/key/name/sort_order…
 * - 但「这个类别要渲染哪种填报面板」必须在前端写死，因为面板的数据源
 *   （项目卡片 / 工作项列表 / 测试用例列表）是静态组件，而不是元数据驱动。
 * - 未来新增一个纯项目级类别时，只需要在后端加一条 migration + 在 CATEGORY_PANEL_KIND
 *   里加一行 key -> "project" 即可。
 * - 新增绑定工作项/测试用例的类别同理：添加 key -> "issue" / "test_case"。
 * - 若未来引入全新的面板形态，需要同步扩展 TTimesheetPanelKind 并在 Modal 中处理。
 */

export const TIMESHEET_CATEGORY_KEY = {
  PROJECT: "PROJECT",
  ISSUE: "ISSUE",
  TEST_CASE: "TEST_CASE",
  SAMPLE: "SAMPLE",
  // 工作项工时拆分：按 issue type 路由（保持与后端 db/models/timesheet.py 常量一致）
  REQUIREMENT: "REQUIREMENT",
  TASK: "TASK",
  BUG: "BUG",
} as const;

/** 后端字典 key 透传到前端后是 string，这里用宽类型以兼容未来新增的 key。 */
export type TTimesheetCategoryKey = string;

/** 填报时右侧面板的形态：选项目 / 选工作项 / 选测试用例。 */
export type TTimesheetPanelKind = "project" | "issue" | "test_case";

/**
 * 类别 key → 面板形态。
 *
 * - 未在映射表中的 key 默认回落到 `"project"`（只挂项目、无二级对象），
 *   这样即便后端新增了一个类别、前端还没来得及发版，也不会报错。
 */
export const CATEGORY_PANEL_KIND: Record<string, TTimesheetPanelKind> = {
  [TIMESHEET_CATEGORY_KEY.PROJECT]: "project",
  [TIMESHEET_CATEGORY_KEY.ISSUE]: "issue",
  [TIMESHEET_CATEGORY_KEY.TEST_CASE]: "test_case",
  [TIMESHEET_CATEGORY_KEY.SAMPLE]: "project",
  [TIMESHEET_CATEGORY_KEY.REQUIREMENT]: "issue",
  [TIMESHEET_CATEGORY_KEY.TASK]: "issue",
  [TIMESHEET_CATEGORY_KEY.BUG]: "issue",
};

export function getCategoryPanelKind(key: string | undefined | null): TTimesheetPanelKind {
  if (!key) return "project";
  return CATEGORY_PANEL_KIND[key] ?? "project";
}

/**
 * 工作项工时子类别 → 允许的 issue type.name 列表。
 *
 * 与后端 apps/api/plane/db/models/timesheet.py::ISSUE_TYPE_NAME_TO_CATEGORY_KEY 对齐，
 * 前端在填报弹窗右侧请求 issue 列表时会把这份白名单作为 `type__name` 查询参数。
 *
 * 未在映射中的 key 不做 type 筛选（兼容旧的通用 ISSUE 类别或未来新增的类别）。
 */
export const CATEGORY_ISSUE_TYPE_NAMES: Record<string, string[]> = {
  [TIMESHEET_CATEGORY_KEY.REQUIREMENT]: ["史诗", "特性", "用户故事"],
  [TIMESHEET_CATEGORY_KEY.TASK]: ["任务"],
  [TIMESHEET_CATEGORY_KEY.BUG]: ["缺陷"],
};

export function getCategoryIssueTypeNames(key: string | undefined | null): string[] | undefined {
  if (!key) return undefined;
  return CATEGORY_ISSUE_TYPE_NAMES[key];
}

/**
 * 类别 key → 左侧菜单 / 时间轴块的展示图标。
 *
 * 图标在组件里引用，这里只是记录 key 到字符串别名的映射，
 * 组件中用 switch 选出对应 lucide 图标组件，避免在常量文件里耦合 UI 组件。
 */
export type TTimesheetCategoryIconName =
  | "Clock"
  | "Layers"
  | "ClipboardCheck"
  | "Beaker"
  | "Target"
  | "ListTodo"
  | "Bug";

export const CATEGORY_ICON_NAME: Record<string, TTimesheetCategoryIconName> = {
  [TIMESHEET_CATEGORY_KEY.PROJECT]: "Clock",
  [TIMESHEET_CATEGORY_KEY.ISSUE]: "Layers",
  [TIMESHEET_CATEGORY_KEY.TEST_CASE]: "ClipboardCheck",
  [TIMESHEET_CATEGORY_KEY.SAMPLE]: "Beaker",
  [TIMESHEET_CATEGORY_KEY.REQUIREMENT]: "Target",
  [TIMESHEET_CATEGORY_KEY.TASK]: "ListTodo",
  [TIMESHEET_CATEGORY_KEY.BUG]: "Bug",
};

/** 送样工时及其它未显式配置的类别回落到时钟图标。 */
export function getCategoryIconName(key: string | undefined | null): TTimesheetCategoryIconName {
  if (!key) return "Clock";
  return CATEGORY_ICON_NAME[key] ?? "Clock";
}
