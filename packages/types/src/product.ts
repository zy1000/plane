import type { TLogoProps } from "./common";
import type { TDataDictionaryItemLite } from "./data-dictionary";
import type { IUserLite } from "./users";

export type TProductNetwork = 0 | 2;

export type TProduct = {
  id: string;
  name: string;
  /** 需求编号的前缀（ECOM-1 里的 ECOM）。工作区内唯一，服务端强制大写。 */
  identifier: string;
  /** 产品代号（如 Cedar28B-032501-水）。工作区内唯一。 */
  code: string;
  description_html: string | null;
  network: TProductNetwork;
  workspace: string;
  owner: string;
  reviewers: string[];
  owner_detail: IUserLite;
  reviewer_details: IUserLite[];
  // 以下字典 / 负责人 / 启动日期字段：API 创建时必填，但 DB 可空（迁移前的存量产品为 null，编辑时必须补齐）
  stage: string | null;
  stage_detail: TDataDictionaryItemLite | null;
  category: string | null;
  category_detail: TDataDictionaryItemLite | null;
  status: string | null;
  status_detail: TDataDictionaryItemLite | null;
  hardware_level: string | null;
  hardware_level_detail: TDataDictionaryItemLite | null;
  structure_level: string | null;
  structure_level_detail: TDataDictionaryItemLite | null;
  software_level: string | null;
  software_level_detail: TDataDictionaryItemLite | null;
  start_date: string | null;
  project_lead: string | null;
  project_lead_detail: IUserLite | null;
  test_lead: string | null;
  test_lead_detail: IUserLite | null;
  model_number: string | null;
  external_model: string | null;
  o_phase_close_date: string | null;
  v_phase_close_date: string | null;
  logo_props: TLogoProps;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TCreateProductPayload = {
  name: string;
  identifier: string;
  code: string;
  description_html?: string | null;
  network: TProductNetwork;
  owner: string;
  reviewers?: string[];
  stage: string;
  category: string;
  status: string;
  hardware_level: string;
  structure_level: string;
  software_level: string;
  /** YYYY-MM-DD */
  start_date: string;
  project_lead: string;
  test_lead: string;
  model_number?: string | null;
  external_model?: string | null;
  o_phase_close_date?: string | null;
  v_phase_close_date?: string | null;
  logo_props?: TLogoProps;
};

export type TUpdateProductPayload = Partial<TCreateProductPayload>;

/** 产品「扩展字段」区（弹窗与设置页共用的那一块）覆盖的字段 */
export type TProductExtendedFieldKey =
  | "code"
  | "stage"
  | "category"
  | "status"
  | "hardware_level"
  | "structure_level"
  | "software_level"
  | "start_date"
  | "project_lead"
  | "test_lead"
  | "model_number"
  | "external_model"
  | "o_phase_close_date"
  | "v_phase_close_date"
  | "reviewers";

export type TProductExtendedPayload = Pick<TCreateProductPayload, TProductExtendedFieldKey>;

export type TProductRole = {
  id: number;
  product: string;
  name: string;
  description: string | null;
  permissions: Record<string, never>;
  created_at: string;
  updated_at: string;
};

export type TCreateProductRolePayload = {
  name: string;
  description?: string | null;
};

export type TUpdateProductRolePayload = Partial<TCreateProductRolePayload>;

export type TProductMember = {
  id: number;
  product: string;
  member: string;
  custom_role_ids: number[];
  member_detail: IUserLite;
  role_details: TProductRole[];
  created_at: string;
  updated_at: string;
};

export type TCreateProductMemberPayload = {
  member: string;
  custom_role_ids?: number[];
};

export type TUpdateProductMemberRolesPayload = {
  custom_role_ids: number[];
};
