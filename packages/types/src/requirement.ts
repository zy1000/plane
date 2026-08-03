import type { TPaginatedResponse } from "./pagination";
import type { IUserLite } from "./users";

export type TRequirementStatus = "draft" | "in_review" | "published";
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
  /** workspace = 需求模板 */
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
  /** null = 从未发布，前端靠它区分「撤回草稿」的两种语义 */
  current_version: number | null;
  pending_change_request_id: string | null;
  can_approve: boolean;
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

/** 一行明细：requirement_id 与 library_id 恒有且仅有一个非空 */
export type TRequirementDetail = {
  id: string;
  requirement_id: string | null;
  library_id: string | null;
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
  approver_ids: string[];
  approval_type: TRequirementApprovalType;
  required_count: number | null;
};

/* --- 需求标准库 --------------------------------------------------------- */

export type TRequirementLibrary = {
  id: string;
  workspace_id: string;
  template_id: string;
  template_detail: {
    id: string;
    title: string;
  };
  name: string;
  description: string;
  /** 模板的字段数——库内条目共用这套字段 */
  field_count: number;
  item_count: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TCreateRequirementLibraryPayload = {
  name: string;
  template_id: string;
  description?: string;
};

/** template_id 创建后不可变——换模板会让库内已填数据全部失效 */
export type TUpdateRequirementLibraryPayload = Partial<Pick<TRequirementLibrary, "name" | "description" | "is_active">>;

/** 条目网格的表头：字段来自库所选模板，只读 */
export type TRequirementLibraryConfiguration = {
  library: TRequirementLibrary;
  fields: TRequirementField[];
  /** 乐观锁基准，取的是模板的 updated_at——改字段动的是模板 */
  expected_updated_at: string;
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

/* --- 变更审批与版本 ------------------------------------------------------ */

export type TRequirementChangeStatus = "pending" | "approved" | "rejected" | "cancelled";
export type TRequirementChangeRequestKind = "initial_publish" | "change";
export type TRequirementChangeType = "create" | "update" | "delete";
/** 变更项分为三组：基本信息 / 字段定义 / 明细数据 */
export type TRequirementChangeTargetKind = "requirement" | "schema" | "detail_data";
export type TRequirementApprovalAction = "approved" | "rejected";

export type TRequirementChangeApproval = {
  id: string;
  approver_id: string;
  approver_detail: IUserLite;
  action: TRequirementApprovalAction | null;
  comment: string | null;
  acted_at: string | null;
};

/** 基本信息组的变更项快照形状 */
export type TRequirementMetaChangeSnapshot = {
  field: string;
  value: unknown;
};

/** 字段定义组的变更项快照形状 */
export type TRequirementSchemaChangeSnapshot = {
  id: string;
  parent_field_id: string | null;
  parent_name: string | null;
  name: string;
  field_type: TRequirementFieldType;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  position?: number;
  config: TRequirementField["config"];
  default_value: TRequirementDetailValue;
};

/** 明细数据组的变更项快照形状 */
export type TRequirementDetailChangeSnapshot = {
  id: string;
  data: TRequirementDetailData;
  sort_order: number;
};

export type TRequirementChangeItem = {
  id: string;
  target_kind: TRequirementChangeTargetKind;
  change_type: TRequirementChangeType;
  target_id: string | null;
  before_snapshot: unknown;
  proposed_snapshot: unknown;
  base_version: number | null;
  proposed_sort_order: number | null;
};

export type TRequirementChangeRequest = {
  id: string;
  requirement_id: string;
  sequence_id: number;
  request_kind: TRequirementChangeRequestKind;
  status: TRequirementChangeStatus;
  reason: string;
  base_version: number | null;
  approval_type: TRequirementApprovalType;
  required_count: number | null;
  created_count: number;
  updated_count: number;
  deleted_count: number;
  item_count: number;
  /** 本次变更涉及的根字段 ID，供「仅显示变化列」使用 */
  changed_field_ids: string[];
  approvals: TRequirementChangeApproval[];
  total_count: number;
  approved_count: number;
  rejected_count: number;
  can_approve: boolean;
  can_cancel: boolean;
  created_by: string | null;
  created_by_detail: IUserLite | null;
  created_at: string;
  completed_at: string | null;
};

/** 变更单详情只内联基本信息与字段定义两组，明细组走 items 分页端点 */
export type TRequirementChangeRequestDetail = TRequirementChangeRequest & {
  requirement_title: string;
  requirement_items: TRequirementChangeItem[];
  schema_items: TRequirementChangeItem[];
  detail_item_count: number;
};

export type TRequirementVersion = {
  id: string;
  requirement_id: string;
  version: number;
  change_type: TRequirementChangeType;
  approved_by: string[];
  change_request_id: string | null;
  change_request_sequence_id: number | null;
  change_request_reason: string | null;
  created_by: string | null;
  created_by_detail: IUserLite | null;
  created_at: string;
};

export type TRequirementVersionDetail = TRequirementVersion & {
  requirement_snapshot: Record<string, unknown>;
  fields_snapshot: TRequirementField[];
  detail_count: number;
};

export type TRequirementVersionComparisonResponse = TPaginatedResponse<TRequirementChangeItem[]> & {
  from_version: number;
  to_version: number;
  requirement_items: TRequirementChangeItem[];
  schema_items: TRequirementChangeItem[];
  detail_item_count: number;
  changed_field_ids: string[];
  to_fields_snapshot: TRequirementField[];
};

export type TRequirementWorkingCopyResponse = {
  requirement: TRequirement;
};

export type TRequirementDiscardDraftResponse = {
  outcome: "deleted" | "reverted";
  requirement?: TRequirement;
};

export type TRequirementChangeRequestsResponse = TPaginatedResponse<TRequirementChangeRequest[]>;
export type TRequirementChangeItemsResponse = TPaginatedResponse<TRequirementChangeItem[]>;
export type TRequirementVersionsResponse = TPaginatedResponse<TRequirementVersion[]>;
export type TRequirementVersionDetailsResponse = TPaginatedResponse<TRequirementDetailChangeSnapshot[]>;
