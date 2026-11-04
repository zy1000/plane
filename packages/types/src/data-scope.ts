/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 数据权限（docs/permission-refactor/data-permission-plan.md）：工作区权限组的项目 / 产品白名单。
 * 组的项目权限只在白名单里的项目生效；各组白名单的并集决定成员能看到哪些项目 / 产品。
 */

export type TDataScopeMode = "all" | "selected" | "filter";

/**
 * 白名单的一段。`filter` 是项目列表 / 产品列表富筛选 adapter 的 `toExternal()` 扁平格式：
 * `{ "and": [{ "status__in": "id1,id2" }, { "end_date__lt": "2026-10-12" }] }`，后端按它求值，新建的项目自动命中。
 */
export type TDataScopeEntry =
  | { mode: "all" }
  | { mode: "selected"; ids: string[] }
  | { mode: "filter"; filter: Record<string, unknown> };

export type TDataScope = {
  projects: TDataScopeEntry;
  products: TDataScopeEntry;
};

/** 列表接口给的一眼能看的摘要：count 只在 selected 时有 */
export type TDataScopeSummary = {
  projects: { mode: TDataScopeMode; count: number | null };
  products: { mode: TDataScopeMode; count: number | null };
};

/** POST roles/data-scope-preview/：一段白名单现在命中多少、前几条 */
export type TDataScopePreview = {
  count: number;
  items: { id: string; name: string; identifier: string }[];
};

/** 模板组「引用项目」页的一行：白名单命中的项目，`excluded` = 项目里删过引用 */
export type TTemplateProjectRef = {
  id: string;
  name: string;
  identifier: string;
  logo_props: Record<string, unknown> | null;
  archived_at: string | null;
  excluded: boolean;
};

export const DEFAULT_DATA_SCOPE: TDataScope = { projects: { mode: "all" }, products: { mode: "all" } };
