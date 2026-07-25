import type { TPaginatedResponse } from "./pagination";
import type { IUserLite } from "./users";

export type TRequirementStatus = "draft" | "in_review" | "published" | "changing";
export type TRequirementApprovalType = "any" | "all" | "n_of_m";
export type TRequirementFieldType =
  | "text"
  | "member"
  | "select"
  | "form"
  | "rich_text"
  | "attachment"
  | "image"
  | "boolean";
export type TRequirementSelectMode = "single" | "multiple";

export type TRequirementSelectOption = {
  id: string;
  label: string;
};

export type TRequirementAssetRef = {
  asset_id: string;
  name: string;
  type: string;
  size: number;
};

export type TRequirementFormRow = {
  id: string;
  values: TRequirementDetailData;
};

export type TRequirementDetailValue =
  | string
  | string[]
  | boolean
  | null
  | TRequirementAssetRef[]
  | TRequirementFormRow[];

export type TRequirementDetailData = Record<string, TRequirementDetailValue>;

export type TRequirement = {
  id: string;
  workspace_id: string;
  scope: "workspace" | "product" | "project";
  product_id: string | null;
  project_id: string | null;
  is_template: boolean;
  template_id: string | null;
  title: string;
  description_html: string | null;
  status: TRequirementStatus;
  owner_id: string;
  owner_detail: IUserLite;
  approval_type: TRequirementApprovalType;
  required_count: number | null;
  approver_ids: string[];
  approver_details: IUserLite[];
  field_count: number;
  detail_count: number;
  can_edit: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TRequirementField = {
  id: string;
  client_id?: string;
  name: string;
  field_type: TRequirementFieldType;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  config: {
    description?: string;
    placeholder?: string;
    selection_mode?: TRequirementSelectMode;
    options?: TRequirementSelectOption[];
  } & Record<string, unknown>;
  default_value: TRequirementDetailValue;
  children: TRequirementField[];
};

export type TRequirementFieldDraft = Omit<TRequirementField, "id" | "sort_order" | "children"> & {
  id?: string;
  client_id?: string;
  sort_order?: number;
  children: TRequirementFieldDraft[];
};

export type TRequirementConfiguration = {
  requirement: TRequirement;
  fields: TRequirementField[];
  created_field_ids: Record<string, string>;
};

export type TRequirementDetail = {
  id: string;
  requirement_id: string;
  data: TRequirementDetailData;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TRequirementDetailBatchCreate = {
  client_id: string;
  data: TRequirementDetailData;
  before_id?: string;
  after_id?: string;
};

export type TRequirementDetailBatchUpdate = {
  id: string;
  data: TRequirementDetailData;
  version: number;
};

export type TRequirementDetailBatchDelete = {
  id: string;
  version: number;
};

export type TRequirementDetailBatchSavePayload = {
  expected_updated_at: string;
  creates: TRequirementDetailBatchCreate[];
  updates: TRequirementDetailBatchUpdate[];
  deletes: TRequirementDetailBatchDelete[];
};

export type TRequirementDetailBatchSaveResponse = {
  created: {
    client_id: string;
    detail: TRequirementDetail;
  }[];
  updated: TRequirementDetail[];
  deleted_ids: string[];
};

export type TRequirementDetailFilterOperator = "contains" | "equals" | "is_empty" | "is_not_empty";

export type TRequirementDetailFilter = {
  field_id: string;
  operator: TRequirementDetailFilterOperator;
  value?: unknown;
};

export type TCreateRequirementTemplatePayload = {
  is_template: true;
  title: string;
  owner_id?: string;
  status?: TRequirementStatus;
  is_active?: boolean;
};

export type TCreateProductRequirementPayload = {
  product_id: string;
  title: string;
  description_html?: string | null;
  owner_id: string;
  template_id?: string | null;
  import_fields: boolean;
  import_details: boolean;
  approver_ids: string[];
  approval_type: TRequirementApprovalType;
  required_count: number | null;
};

export type TUpdateProductRequirementPayload = Partial<
  Pick<
    TRequirement,
    "title" | "description_html" | "owner_id" | "status" | "approver_ids" | "approval_type" | "required_count"
  >
>;

export type TRequirementConfigurationPayload = {
  expected_updated_at: string;
  requirement: Partial<
    Pick<
      TRequirement,
      | "title"
      | "description_html"
      | "status"
      | "owner_id"
      | "approval_type"
      | "required_count"
      | "approver_ids"
      | "is_active"
    >
  >;
  fields: TRequirementFieldDraft[];
  confirm_data_loss?: boolean;
};

export type TRequirementDetailsResponse = TPaginatedResponse<TRequirementDetail[]>;
