/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EProjectDictionaryKey } from "@plane/types";
import type { IUserLite } from "@plane/types";
import type { TProject } from "@/plane-web/types/projects";

/** 项目字典字段 → 对应的系统字典 key */
export const PROJECT_DICTIONARY_FIELDS = {
  business_unit: EProjectDictionaryKey.BUSINESS_UNIT,
  status: EProjectDictionaryKey.STATUS,
  project_type: EProjectDictionaryKey.PROJECT_TYPE,
} as const;

export type TProjectDictionaryFieldKey = keyof typeof PROJECT_DICTIONARY_FIELDS;
export type TProjectMemberFieldKey = "project_lead" | "product_manager";
export type TProjectDateFieldKey = "start_date" | "end_date";

/** 创建弹窗与设置页两张表单覆盖的全部字段（服务端字段级错误按这些 key 分发） */
export type TProjectFormFieldKey =
  | "name"
  | "identifier"
  | "code"
  | "network"
  | "description"
  | "description_html"
  | "pms_project_name"
  | "timezone"
  | "grade"
  | "product_type"
  | TProjectDictionaryFieldKey
  | TProjectMemberFieldKey
  | TProjectDateFieldKey;

export const PROJECT_FORM_FIELD_KEYS: TProjectFormFieldKey[] = [
  "name",
  "identifier",
  "code",
  "network",
  "business_unit",
  "description",
  "description_html",
  "pms_project_name",
  "timezone",
  "project_type",
  "status",
  "grade",
  "product_type",
  "project_lead",
  "product_manager",
  "start_date",
  "end_date",
];

/**
 * API 创建必填、但 DB 可空的字段（0348 之前的存量项目为 null）。
 * 设置页用它算「缺哪些必填」的横幅；grade / product_type 不在其中 —— 设置页仍允许「未设置」。
 */
export const PROJECT_REQUIRED_FIELDS = [
  "code",
  "project_type",
  "status",
  "project_lead",
  "product_manager",
  "start_date",
  "end_date",
] as const;

export type TProjectRequiredFieldKey = (typeof PROJECT_REQUIRED_FIELDS)[number];

/** 字段 → i18n label key（description_html 与 description 共用一个 label） */
export const getProjectFieldLabelKey = (key: TProjectFormFieldKey) =>
  `workspace_projects.fields.${key === "description_html" ? "description" : key}`;

/** project_lead 在列表 / 详情接口里分别是 id 与 IUserLite，统一归一到 id */
export const normalizeUserId = (value: IUserLite | string | null | undefined): string | null =>
  typeof value === "string" ? value : (value?.id ?? null);

export const getMissingProjectRequiredFields = (project: Partial<TProject>): TProjectRequiredFieldKey[] =>
  PROJECT_REQUIRED_FIELDS.filter((key) => {
    const value = key === "project_lead" ? normalizeUserId(project.project_lead) : project[key];
    return typeof value === "string" ? value.trim() === "" : value === null || value === undefined;
  });

/** 后端错误码 → i18n key；未命中的按 DRF 必填文案回退到「请填写{field}」，再不行原样展示 */
export const PROJECT_SERVER_ERROR_I18N: Record<string, string> = {
  PROJECT_NAME_ALREADY_EXIST: "project_name_already_taken",
  PROJECT_IDENTIFIER_ALREADY_EXIST: "project_identifier_already_taken",
  PROJECT_CODE_ALREADY_EXIST: "workspace_projects.validation.code_already_exists",
  PROJECT_GRADE_REQUIRED: "project_grade_required",
  INVALID_PROJECT_GRADE: "workspace_projects.validation.invalid_option",
  PROJECT_DICTIONARY_ITEM_INVALID: "workspace_projects.validation.invalid_option",
  PROJECT_PRODUCT_MANAGER_NOT_WORKSPACE_MEMBER: "workspace_projects.validation.invalid_option",
};
