/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TExportFieldGroup = "基础" | "人员" | "关联" | "时间" | "元数据";

export type TExportFieldItem = {
  /** 后端字段 key（与 apps/api/plane/app/views/issue/base.py EXPORT_FIELD_LABELS 对齐）。 */
  key: string;
  /** 中文列标签，用于弹窗勾选与后端中文表头保持一致。 */
  label: string;
  /** 分组，前端分栏用。 */
  group: TExportFieldGroup;
};

/**
 * 可导出字段清单。顺序即默认列顺序，与后端 EXPORT_ALL_FIELDS 保持一致。
 * 新增字段时：先在后端 base.py 中添加，再同步这里。
 */
export const EXPORT_FIELD_ITEMS: TExportFieldItem[] = [
  { key: "key", label: "标识", group: "基础" },
  { key: "name", label: "标题", group: "基础" },
  { key: "description", label: "描述", group: "基础" },
  { key: "state", label: "状态", group: "基础" },
  { key: "state_group", label: "状态分组", group: "基础" },
  { key: "priority", label: "优先级", group: "基础" },
  { key: "issue_type", label: "工作项类型", group: "基础" },
  { key: "is_draft", label: "草稿", group: "基础" },
  { key: "assignees", label: "负责人", group: "人员" },
  { key: "created_by", label: "创建人", group: "人员" },
  { key: "updated_by", label: "最后更新人", group: "人员" },
  { key: "labels", label: "标签", group: "关联" },
  { key: "cycles", label: "迭代", group: "关联" },
  { key: "modules", label: "模块", group: "关联" },
  { key: "parent_key", label: "父工作项标识", group: "关联" },
  { key: "parent_name", label: "父工作项标题", group: "关联" },
  { key: "project", label: "项目", group: "关联" },
  { key: "start_date", label: "开始日期", group: "时间" },
  { key: "target_date", label: "截止日期", group: "时间" },
  { key: "completed_at", label: "完成时间", group: "时间" },
  { key: "created_at", label: "创建时间", group: "时间" },
  { key: "updated_at", label: "更新时间", group: "时间" },
  { key: "id", label: "ID", group: "元数据" },
  { key: "estimate", label: "预估", group: "元数据" },
  { key: "sub_issues_count", label: "子项数", group: "元数据" },
  { key: "link_count", label: "链接数", group: "元数据" },
  { key: "attachment_count", label: "附件数", group: "元数据" },
];

export const EXPORT_FIELD_GROUPS: TExportFieldGroup[] = ["基础", "人员", "关联", "时间", "元数据"];

/** 默认勾选：常用的展示字段。 */
export const DEFAULT_EXPORT_FIELDS: string[] = [
  "key",
  "name",
  "state",
  "priority",
  "issue_type",
  "assignees",
  "labels",
  "cycles",
  "modules",
  "start_date",
  "target_date",
  "created_at",
  "updated_at",
  "created_by",
];

export type TExportFormat = "csv" | "xlsx" | "json";

export const EXPORT_FORMAT_OPTIONS: { value: TExportFormat; label: string }[] = [
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "csv", label: "CSV (.csv)" },
  { value: "json", label: "JSON (.json)" },
];
