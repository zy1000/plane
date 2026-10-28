/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 工作区「通用字段库」。
 *
 * 库字段的定义（名称、类型、选项、选择方式、说明、必填、默认值）只在库里改；工作项类型「绑定」库字段后，
 * 类型里那一行（`TTypeExtraField.library_field_id` 非空）只读，库字段保存时后端把定义同步到所有绑定行。
 */
export type TIssueFieldType = "text" | "number" | "date" | "boolean" | "select" | "user";

/** 使用该库字段的类型（只含研发模式类型库里的类型，不含自定义项目拷贝出的类型） */
export type TIssueFieldLibraryUsedBy = {
  issue_type_id: string;
  name: string;
  logo_props?: {
    icon?: { name?: string; color?: string; background_color?: string };
    [key: string]: unknown;
  } | null;
};

export type TIssueFieldLibraryItem = {
  id: string;
  name: string;
  description: string;
  field_type: TIssueFieldType;
  /** select：`choices` + `selection_mode`；text：`text_mode`；user：`selection_mode` */
  options: Record<string, unknown>;
  default_value: unknown;
  validation: Record<string, unknown>;
  is_required: boolean;
  is_active: boolean;
  logo_props: Record<string, unknown>;
  sort_order: number;
  used_by: TIssueFieldLibraryUsedBy[];
  /** 全工作区绑定行总数（含自定义项目里拷贝出的类型），> 0 时删除会 409 */
  binding_count: number;
  created_at: string;
  updated_at: string;
};

export type TIssueFieldLibraryPayload = Partial<
  Pick<
    TIssueFieldLibraryItem,
    | "name"
    | "description"
    | "field_type"
    | "options"
    | "default_value"
    | "validation"
    | "is_required"
    | "is_active"
    | "logo_props"
    | "sort_order"
  >
>;

/** 删除仍有绑定的库字段：409 */
export type TIssueFieldLibraryInUseError = {
  error: string;
  code: "ISSUE_FIELD_IN_USE";
  binding_count: number;
};
