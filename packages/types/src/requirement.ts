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
/** 每个需求类型必有的两个字段，前后端都不可删除 */
export type TRequirementBuiltinFieldKey = "title" | "description";

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
  values: TRequirementData;
};

export type TRequirementValue =
  | string
  | string[]
  | boolean
  | null
  | TRequirementAssetRef[]
  | TRequirementFormRow[];

/** 一行需求的字段值，key 是字段 UUID */
export type TRequirementData = Record<string, TRequirementValue>;

/** 相对上一个已发布版本的变更标记；null 表示这一行没变 */
export type TRequirementChangeKind = "created" | "updated";

/**
 * 一条需求。product_id / project_id / library_id 恒有且仅有一个非空。
 *
 * data 是**完整的一行**：内置的标题与描述同样以各自的字段 UUID 为 key 出现在里面
 * （后端存储上它们是独立的列，接口层已经合并好），所以网格不需要为内置字段分支。
 * title / description_html 另外平铺出来，供列表排序与跨类型的默认视图直接取用。
 */
export type TRequirement = {
  id: string;
  product_id: string | null;
  project_id: string | null;
  library_id: string | null;
  /** 定义本行字段的需求类型 */
  requirement_type_id: string;
  title: string;
  description_html: string | null;
  data: TRequirementData;
  sort_order: number;
  version: number;
  change_kind: TRequirementChangeKind | null;
  /** 最后一次发生变更的基线版本号；null = 尚未随基线发布过 */
  last_changed_version: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

/**
 * 需求基线：一个产品（或项目）的全部需求作为一个整体的审批与版本单元。
 *
 * 每个作用域唯一一条，由后端惰性创建，所以前端不需要「创建基线」这个动作。
 */
export type TRequirementBaseline = {
  id: string;
  workspace_id: string;
  scope: "product" | "project";
  product_id: string | null;
  project_id: string | null;
  status: TRequirementStatus;
  owner_id: string;
  owner_detail: IUserLite;
  approval_type: TRequirementApprovalType;
  required_count: number | null;
  approver_ids: string[];
  approver_details: IUserLite[];
  can_edit: boolean;
  /** null = 从未发布，前端靠它区分「撤回草稿」的两种语义 */
  current_version: number | null;
  pending_change_request_id: string | null;
  can_approve: boolean;
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
  /** 非 null 时为内置字段：不可删除、类型与启用状态不可更改 */
  builtin_key: TRequirementBuiltinFieldKey | null;
  /** 定义该字段的需求类型 */
  requirement_type_id?: string | null;
  config: {
    description?: string;
    placeholder?: string;
    selection_mode?: TRequirementSelectMode;
    options?: TRequirementSelectOption[];
  } & Record<string, unknown>;
  default_value: TRequirementValue;
  children: TRequirementField[];
};

export type TRequirementFieldDraft = Omit<TRequirementField, "id" | "sort_order" | "children"> & {
  id?: string;
  client_id?: string;
  sort_order?: number;
  children: TRequirementFieldDraft[];
};

/** 基线引用到的一个需求类型：id/name + 该类型的字段树 */
export type TRequirementTypeSchema = {
  id: string;
  name: string;
  fields: TRequirementField[];
  /** 默认视图要跨类型对齐标题/描述两列，而各类型的字段 UUID 不同 */
  builtin_field_ids: Partial<Record<TRequirementBuiltinFieldKey, string>>;
};

export type TRequirementBaselineConfiguration = {
  baseline: TRequirementBaseline;
  /** 所有引用到的需求类型字段的扁平并集 */
  fields: TRequirementField[];
  /** 基线下的需求引用到的需求类型，数据页据此分视图 */
  requirement_types: TRequirementTypeSchema[];
  /** true = 字段取自发版时冻结的快照（已发布只读态） */
  is_frozen: boolean;
  /** 网格的乐观锁基准，与 baseline.updated_at 是两个不同的值 */
  expected_updated_at?: string;
};

export type TRequirementBatchCreate = {
  client_id: string;
  data: TRequirementData;
  requirement_type_id?: string;
  before_id?: string;
  after_id?: string;
};

export type TRequirementBatchUpdate = {
  id: string;
  data: TRequirementData;
  version: number;
};

export type TRequirementBatchDelete = {
  id: string;
  version: number;
};

export type TRequirementBatchSavePayload = {
  expected_updated_at: string;
  creates: TRequirementBatchCreate[];
  updates: TRequirementBatchUpdate[];
  deletes: TRequirementBatchDelete[];
};

export type TRequirementBatchSaveResponse = {
  created: {
    client_id: string;
    requirement: TRequirement;
  }[];
  updated: TRequirement[];
  deleted_ids: string[];
};

export type TRequirementFilterOperator = "contains" | "equals" | "is_empty" | "is_not_empty";

export type TRequirementFilter = {
  field_id: string;
  operator: TRequirementFilterOperator;
  value?: unknown;
};

/* --- 需求标准库 --------------------------------------------------------- */

export type TRequirementLibrary = {
  id: string;
  workspace_id: string;
  requirement_type_id: string;
  requirement_type_detail: {
    id: string;
    name: string;
  };
  name: string;
  description: string;
  /** 需求类型的字段数——库内条目共用这套字段 */
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
  requirement_type_id: string;
  description?: string;
};

/** requirement_type_id 创建后不可变——换类型会让库内已填数据全部失效 */
export type TUpdateRequirementLibraryPayload = Partial<Pick<TRequirementLibrary, "name" | "description" | "is_active">>;

/** 条目网格的表头：字段来自库所选的需求类型，只读 */
export type TRequirementLibraryConfiguration = {
  library: TRequirementLibrary;
  fields: TRequirementField[];
  /** 乐观锁基准，取的是需求类型的 updated_at——改字段动的是类型 */
  expected_updated_at: string;
};

export type TRequirementBaselineConfigurationPayload = {
  expected_updated_at: string;
  baseline: Partial<
    Pick<TRequirementBaseline, "owner_id" | "approval_type" | "required_count" | "approver_ids">
  >;
};

export type TRequirementsResponse = TPaginatedResponse<TRequirement[]>;

/* --- 从标准库导入 -------------------------------------------------------- */

export type TRequirementImportPayload = {
  library_id: string;
  item_ids: string[];
  before_id?: string;
  after_id?: string;
};

export type TRequirementImportResponse = {
  created: {
    client_id: string;
    requirement: TRequirement;
  }[];
  updated: TRequirement[];
  deleted_ids: string[];
  /** 本次导入的行绑定到的需求类型，前端据此把视图切过去 */
  requirement_type_id: string;
};

/* --- 变更审批与版本 ------------------------------------------------------ */

export type TRequirementChangeStatus = "pending" | "approved" | "rejected" | "cancelled";
export type TRequirementChangeRequestKind = "initial_publish" | "change";
export type TRequirementChangeType = "create" | "update" | "delete";
/** 变更项分为三组：审批配置 / 字段定义 / 需求条目 */
export type TRequirementChangeTargetKind = "baseline" | "schema" | "requirement";
export type TRequirementApprovalAction = "approved" | "rejected";

export type TRequirementChangeApproval = {
  id: string;
  approver_id: string;
  approver_detail: IUserLite;
  action: TRequirementApprovalAction | null;
  comment: string | null;
  acted_at: string | null;
};

/** 审批配置组的变更项快照形状 */
export type TRequirementBaselineChangeSnapshot = {
  field: string;
  value: unknown;
};

/** 字段定义组的变更项快照形状 */
export type TRequirementSchemaChangeSnapshot = {
  id: string;
  parent_field_id: string | null;
  parent_name: string | null;
  requirement_type_id: string | null;
  builtin_key: TRequirementBuiltinFieldKey | null;
  name: string;
  field_type: TRequirementFieldType;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  position?: number;
  config: TRequirementField["config"];
  default_value: TRequirementValue;
};

/** 需求条目组的变更项快照形状；data 是合并态，与网格读到的一行同形 */
export type TRequirementChangeSnapshot = {
  id: string;
  requirement_type_id: string;
  data: TRequirementData;
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
  baseline_id: string;
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

/** 本次变更涉及的一个需求类型：评审页据此分视图，计数用来画切换器上的徽标 */
export type TRequirementTypeChangeStat = {
  id: string;
  /** 需求类型已被删除时为空串 */
  name: string;
  created_count: number;
  updated_count: number;
  deleted_count: number;
  schema_item_count: number;
};

/** 变更单详情只内联审批配置与字段定义两组，需求条目组走 items 分页端点 */
export type TRequirementChangeRequestDetail = TRequirementChangeRequest & {
  baseline_items: TRequirementChangeItem[];
  schema_items: TRequirementChangeItem[];
  requirement_item_count: number;
  requirement_type_stats: TRequirementTypeChangeStat[];
};

export type TRequirementVersion = {
  id: string;
  baseline_id: string;
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

/** 版本快照涉及的一个需求类型：快照没有「变更」概念，计数是字段数与条目数 */
export type TRequirementTypeVersionStat = {
  id: string;
  /** 需求类型已被删除时为空串 */
  name: string;
  field_count: number;
  requirement_count: number;
};

export type TRequirementVersionDetail = TRequirementVersion & {
  baseline_snapshot: Record<string, unknown>;
  fields_snapshot: TRequirementField[];
  requirement_count: number;
  requirement_type_stats: TRequirementTypeVersionStat[];
};

export type TRequirementVersionComparisonResponse = TPaginatedResponse<TRequirementChangeItem[]> & {
  from_version: number;
  to_version: number;
  baseline_items: TRequirementChangeItem[];
  schema_items: TRequirementChangeItem[];
  requirement_item_count: number;
  changed_field_ids: string[];
  to_fields_snapshot: TRequirementField[];
  /** 与变更单详情同形；不含无变更的需求类型 */
  requirement_type_stats: TRequirementTypeChangeStat[];
};

export type TRequirementWorkingCopyResponse = {
  baseline: TRequirementBaseline;
};

export type TRequirementDiscardDraftResponse = {
  /** cleared = 从未发布过，条目被清空；reverted = 丢弃工作副本回到已发布态 */
  outcome: "cleared" | "reverted";
  baseline: TRequirementBaseline;
};

export type TRequirementChangeRequestsResponse = TPaginatedResponse<TRequirementChangeRequest[]>;
export type TRequirementChangeItemsResponse = TPaginatedResponse<TRequirementChangeItem[]>;
export type TRequirementVersionsResponse = TPaginatedResponse<TRequirementVersion[]>;
export type TRequirementVersionRequirementsResponse = TPaginatedResponse<TRequirementChangeSnapshot[]>;
