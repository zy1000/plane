/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 数据权限（docs/permission-refactor/split-plan.md）：kind=data 的权限组的项目 / 产品白名单。
 * 各数据权限白名单的并集（加上成员项目）决定成员能看到、能进哪些项目 / 产品；
 * 工作区权限组的项目权限在这些项目上全部生效。
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
  /** count：当前命中数（全部 = 工作区总数，指定 = 勾选数，按条件 = 现在满足条件的个数） */
  projects: { mode: TDataScopeMode; count: number | null };
  products: { mode: TDataScopeMode; count: number | null };
};

/** POST roles/data-scope-preview/：一段白名单现在命中多少、前几条 */
export type TDataScopePreview = {
  count: number;
  items: { id: string; name: string; identifier: string }[];
};

/** 模板「引用项目」页的一行：工作区的一个项目，`excluded` = 项目里删过引用 */
export type TTemplateProjectRef = {
  id: string;
  name: string;
  identifier: string;
  logo_props: Record<string, unknown> | null;
  archived_at: string | null;
  project_lead_id: string | null;
  excluded: boolean;
  /** 本项目里绑在这个模板上的成员数 */
  bound_member_count: number;
};

export const DEFAULT_DATA_SCOPE: TDataScope = { projects: { mode: "all" }, products: { mode: "all" } };
