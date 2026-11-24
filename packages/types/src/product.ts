import type { TLogoProps } from "./common";
import type { TDataDictionaryItemLite } from "./data-dictionary";
import type { TRequirementItemStatus } from "./requirement";
import type { IUserLite } from "./users";

export type TProduct = {
  id: string;
  name: string;
  /** 需求编号的前缀（ECOM-1 里的 ECOM）。工作区内唯一，服务端强制大写。 */
  identifier: string;
  /** 产品代号（如 Cedar28B-032501-水）。工作区内唯一。 */
  code: string;
  description_html: string | null;
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
  /** 产品集是一种特殊的产品：需求 / 用例 / 工作项 / 关联项目沿用产品的页面，另有「产品」页签 */
  is_set: boolean;
  /** 所属产品集（一个产品最多属于一个）。只读，加入 / 移出走产品集的「产品」页签 */
  product_set: string | null;
  product_set_detail: TProductSetLite | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  /** 当前用户在这个产品里的有效 product.* 权限；产品内所有按钮显隐都读它 */
  my_permission_keys: string[];
};

export type TProductSetLite = Pick<TProduct, "id" | "name" | "identifier" | "logo_props">;

/** 产品集列表行：GET /product-sets/。汇总数字只有列表接口给，增改接口的返回里没有 */
export type TProductSet = Pick<
  TProduct,
  | "id"
  | "name"
  | "identifier"
  | "description_html"
  | "workspace"
  | "owner"
  | "owner_detail"
  | "logo_props"
  | "created_at"
  | "updated_at"
  | "created_by"
  | "updated_by"
  | "my_permission_keys"
> & {
  /** 集内产品（按当前用户的产品可见范围），列表里挂在产品集下面当子行 */
  products: TProductSetListMember[];
  requirement_count: number;
  case_count: number;
  open_defect_count: number;
};

/** 产品集列表里的一个集内产品：GET /product-sets/ 的 products[] */
export type TProductSetListMember = Pick<TProduct, "id" | "name" | "identifier" | "owner_detail" | "updated_at"> & {
  requirement_count: number;
  case_count: number;
  open_defect_count: number;
};

export type TProductSetPayload = {
  name: string;
  identifier: string;
  owner?: string;
  description_html?: string | null;
};

/** 产品集「产品」页签的一行：GET /product-sets/<id>/products/ */
export type TProductSetMember = Pick<TProduct, "id" | "name" | "identifier" | "code" | "logo_props"> & {
  status_detail: TDataDictionaryItemLite | null;
  joined_at: string | null;
  /** 这个产品引用了几条产品集需求 / 把几条转成了自有（没删的） */
  referenced_requirement_count: number;
  converted_requirement_count: number;
};

export type TCreateProductPayload = {
  name: string;
  identifier: string;
  code: string;
  description_html?: string | null;
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

/** 产品概览：GET /products/<id>/overview/（后端 utils/product_overview.py）。没权限的块是 null */
export type TProductOverviewRequirements = {
  total: number;
  status_counts: Record<TRequirementItemStatus, number>;
  /** 有待审批变更（pending_change_item）的需求 */
  in_review_count: number;
  /** 未交付完（未开始 / 已立项 / 进行中）且截止日期已过 */
  overdue_count: number;
  /** 未交付完且 7 天内到期 */
  due_soon_count: number;
  pending_change_request_count: number;
  /** 未关闭需求里有用例的条数 / 未关闭需求总数 */
  coverage: { covered_count: number; total: number };
};

export type TProductOverviewTest = {
  case_count: number | null;
  repository_count: number | null;
  active_review_count: number | null;
};

export type TProductOverview = {
  requirements: TProductOverviewRequirements | null;
  test: TProductOverviewTest;
};
