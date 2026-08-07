import type { TLogoProps } from "./common";
import type { TPaginatedResponse } from "./pagination";
import type { IUserLite } from "./users";

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
/** 自定义字段的分类：标准字段进标准库，数据字段只在产品需求里出现。没有默认值，建字段时必须选 */
export type TRequirementFieldCategory = "standard" | "data";
/**
 * 需求的**内容**状态。不表达评审进度 —— 那是另一根轴，见 TRequirementApprovalState。
 *
 * draft 只由系统写：新建时置入，首次通过审批后置 confirmed，此后再也回不到 draft。
 */
export type TRequirementItemStatus = "draft" | "confirmed" | "implemented" | "obsolete";

/**
 * 需求的**审批**态。服务端由三列派生后下发，前端不要自己从 pending_change_request_id
 * 反推 —— 那样会漏掉权限这一维。
 *
 * modified = 已通过审批但之后又改过，还没提交。
 */
export type TRequirementApprovalState =
  | "draft"
  | "in_review"
  | "pending_deletion"
  | "approved"
  | "modified";
/** 与工作项优先级取值一致，可直接复用工作项的优先级下拉 */
export type TRequirementPriority = "urgent" | "high" | "medium" | "low" | "none";

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

/** 一行需求的自定义字段值，key 是字段 UUID。内置字段不在这里，它们平铺在行上 */
export type TRequirementData = Record<string, TRequirementValue>;

/**
 * 八个内置字段。每个需求类型都默认包含，不可删除不可编辑；它们是需求行上的独立
 * 列，不是 RequirementField，所以网格要用两组列渲染：内置列 + 需求类型给的自定义列。
 */
export type TRequirementBuiltinValues = {
  title: string;
  description_html: string | null;
  status: TRequirementItemStatus;
  priority: TRequirementPriority;
  assignee_id: string | null;
  /** YYYY-MM-DD */
  start_date: string | null;
  /** YYYY-MM-DD */
  target_date: string | null;
  /** 同一归属（同产品 / 同标准库）内另一条需求的 id */
  parent_id: string | null;
};

export type TRequirementBuiltinKey = keyof TRequirementBuiltinValues;

/**
 * 一条需求。product_id / project_id / library_id 恒有且仅有一个非空。
 *
 * 八个内置字段平铺在行上，data 只装自定义字段（key 是字段 UUID）。两组值在接口层
 * 是平级的，网格分别用内置列渲染器与自定义列渲染器展示。
 */
export type TRequirement = TRequirementBuiltinValues & {
  id: string;
  product_id: string | null;
  project_id: string | null;
  library_id: string | null;
  /** 定义本行字段的需求类型 */
  requirement_type_id: string;
  data: TRequirementData;
  sort_order: number;
  /**
   * 乐观锁计数器，每次写入 +1。**不是**审批版本号 —— 那是 approved_version，两者
   * 是完全不同的两个数字。
   */
  version: number;
  approval_state: TRequirementApprovalState;
  /** 最后一次通过审批的版本号；null = 从未通过审批 */
  approved_version: number | null;
  pending_change_request_id: string | null;
  pending_change_type: TRequirementChangeType | null;
  /** 服务端权威。行在评审中就锁住，不要从 pending_change_request_id 自己推 */
  is_locked: boolean;
  can_submit_review: boolean;
  can_withdraw: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

/**
 * 需求审批配置：一个产品（或项目）的「谁能批、要几个人批」。
 *
 * 它不持有状态也不持有版本 —— 那些现在长在每一条需求上。每个作用域唯一一条，由后端
 * 惰性创建，所以前端不需要「创建配置」这个动作。
 */
export type TRequirementApprovalPolicy = {
  id: string;
  workspace_id: string;
  scope: "product" | "project";
  product_id: string | null;
  project_id: string | null;
  owner_id: string;
  owner_detail: IUserLite;
  approval_type: TRequirementApprovalType;
  required_count: number | null;
  approver_ids: string[];
  approver_details: IUserLite[];
  /** 能不能录入/修改需求条目 */
  can_edit: boolean;
  /** 能不能改审批配置本身。必然比 can_edit 窄 —— 否则谁都能把审批人改成自己 */
  can_manage: boolean;
  /** 现在一个产品下可以同时有多张待审单，所以给计数而不是单个 id */
  pending_change_request_count: number;
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
  /** 决定这个字段进不进标准库。表单子字段跟随所属表单，后端保存时强制继承 */
  field_category: TRequirementFieldCategory;
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

export type TRequirementFieldDraft = Omit<
  TRequirementField,
  "id" | "sort_order" | "children" | "field_category"
> & {
  id?: string;
  client_id?: string;
  sort_order?: number;
  /** 草稿态允许未选，保存前拦截 —— 分类没有默认值 */
  field_category: TRequirementFieldCategory | null;
  children: TRequirementFieldDraft[];
};

/** 基线引用到的一个需求类型：id/name/图标 + 该类型的字段树 */
export type TRequirementTypeSchema = {
  id: string;
  name: string;
  /** 图标配置，与工作项类型同形状；字段结构会随版本冻结，图标不会 */
  logo_props?: Partial<TLogoProps>;
  fields: TRequirementField[];
};

export type TRequirementConfiguration = {
  policy: TRequirementApprovalPolicy;
  /** 所有引用到的需求类型字段的扁平并集 */
  fields: TRequirementField[];
  /** 这个作用域下的需求引用到的需求类型，数据页据此分视图 */
  requirement_types: TRequirementTypeSchema[];
};

export type TRequirementBatchCreate = {
  client_id: string;
  data: TRequirementData;
  builtin: TRequirementBuiltinValues;
  requirement_type_id?: string;
  before_id?: string;
  after_id?: string;
};

export type TRequirementBatchUpdate = {
  id: string;
  data: TRequirementData;
  builtin: TRequirementBuiltinValues;
  version: number;
};

export type TRequirementBatchDelete = {
  id: string;
  version: number;
};

/**
 * 网格批量保存。
 *
 * 没有 expected_updated_at：它原本是 max(基线, 各需求类型).updated_at，而字段结构变更
 * 现在立即生效，任何一次类型编辑都会顶高这个 max，把所有打开着的网格的暂存编辑全部打成
 * 409 —— 哪怕改的类型跟他无关。真实冲突由逐行 version 覆盖。
 */
export type TRequirementBatchSavePayload = {
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
    logo_props?: Partial<TLogoProps>;
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

export type TRequirementConfigurationPayload = {
  expected_updated_at: string;
  policy: Partial<
    Pick<TRequirementApprovalPolicy, "owner_id" | "approval_type" | "required_count" | "approver_ids">
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
export type TRequirementChangeType = "create" | "update" | "delete";
export type TRequirementApprovalAction = "approved" | "rejected";

export type TRequirementChangeApproval = {
  id: string;
  approver_id: string;
  approver_detail: IUserLite;
  action: TRequirementApprovalAction | null;
  comment: string | null;
  acted_at: string | null;
};

/** 字段结构修订里的单个字段快照 */
export type TRequirementSchemaChangeSnapshot = {
  id: string;
  parent_field_id: string | null;
  parent_name: string | null;
  requirement_type_id: string | null;
  field_category: TRequirementFieldCategory | null;
  name: string;
  field_type: TRequirementFieldType;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  position?: number;
  config: TRequirementField["config"];
  default_value: TRequirementValue;
};

/** 变更项/版本里的行快照：内置列平铺 + data 装自定义字段，与网格读到的一行同形 */
export type TRequirementChangeSnapshot = TRequirementBuiltinValues & {
  id: string;
  requirement_type_id: string;
  data: TRequirementData;
  sort_order: number;
};

/**
 * 一条需求的前后差异。
 *
 * 变更单条目与基线对比结果共用这一个形状，两个 diff 渲染器（竖排两栏 / 明细网格）
 * 只读这几个字段 —— 所以它们同时服务于「这张单改了什么」和「这两份基线差在哪」。
 */
export type TRequirementDiffItem = {
  id: string;
  change_type: TRequirementChangeType;
  /** 目标需求 ID。恒不为空 —— 新增的行提交前就已经在表里了（草稿态） */
  target_id: string;
  requirement_type_id: string;
  requirement_type_name: string;
  /** 拟变更后的标题；删除项回落到变更前那份 */
  title: string;
  before_snapshot: TRequirementChangeSnapshot | null;
  proposed_snapshot: TRequirementChangeSnapshot | null;
  /** 变更单里是提交时的 approved_version；基线对比里是前一份基线收录的版本号 */
  base_version: number | null;
  proposed_sort_order: number | null;
};

export type TRequirementChangeItem = TRequirementDiffItem & {
  schema_revision_id: string;
  /** 提交时的乐观锁值 */
  base_row_version: number;
};

/** 需求类型字段结构的一次修订 */
export type TRequirementSchemaRevision = {
  id: string;
  requirement_type_id: string;
  requirement_type_name: string;
  revision: number;
  diff: {
    change_type: TRequirementChangeType;
    field_id: string;
    parent_field_id: string | null;
    name: string;
    before: TRequirementSchemaChangeSnapshot | null;
    after: TRequirementSchemaChangeSnapshot | null;
  }[];
  actor_detail: IUserLite | null;
  created_at: string;
};

/**
 * 变更轨迹的一条：内容变更与字段结构变更并成的一条时间线，用 kind 判别。
 *
 * schema 条目在该类型下**每条需求**里都会一模一样地出现 —— 渲染时必须让它视觉后退，
 * 并点明「需求类型级变更，影响该类型全部需求」，否则读起来像是有人改了这一行。
 */
export type TRequirementContentTrailEntry = TRequirementChangeItem & {
  kind: "content";
  occurred_at: string;
  change_request_id: string;
  /** 变更单在作用域内的自增序号，展示成 CR-001 */
  sequence_id: number;
  change_status: TRequirementChangeStatus;
  reason: string;
  actor_detail: IUserLite | null;
  /** 通过后落在这条需求的第几版；未通过为 null */
  version: number | null;
};

export type TRequirementSchemaTrailEntry = TRequirementSchemaRevision & {
  kind: "schema";
  occurred_at: string;
};

export type TRequirementTrailEntry = TRequirementContentTrailEntry | TRequirementSchemaTrailEntry;

/** 提交评审：只发指针不发快照，服务端自己读当前行内容 */
export type TRequirementSubmitReviewPayload = {
  reason?: string;
  items: {
    requirement_id: string;
    /** 只有 delete 是真的意图；新增与修改由服务端按 approved_version 判定 */
    change_type?: TRequirementChangeType;
  }[];
};

export type TRequirementChangeRequest = {
  id: string;
  product_id: string | null;
  project_id: string | null;
  /** 作用域内的自增序号，展示成 CR-001 */
  sequence_id: number;
  status: TRequirementChangeStatus;
  reason: string;
  approval_type: TRequirementApprovalType;
  required_count: number | null;
  created_count: number;
  updated_count: number;
  deleted_count: number;
  /** 这张单覆盖几条需求 */
  requirement_count: number;
  /** 列表里画一行摘要用，最多前 3 条 */
  requirement_previews: {
    id: string;
    title: string;
    change_type: TRequirementChangeType;
  }[];
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
  logo_props?: Partial<TLogoProps>;
  created_count: number;
  updated_count: number;
  deleted_count: number;
};

/**
 * 变更单详情。
 *
 * requirement_items 在条目不多时直接内联（N 通常是个位数）；超过阈值时为 null，
 * 走 items 分页端点。
 */
export type TRequirementChangeRequestDetail = TRequirementChangeRequest & {
  requirement_items: TRequirementChangeItem[] | null;
  requirement_type_stats: TRequirementTypeChangeStat[];
};

/** 一条需求的一个已通过版本 */
export type TRequirementVersion = {
  id: string;
  target_id: string;
  requirement_type_id: string;
  version: number;
  change_type: TRequirementChangeType;
  /** 这一版当时的内容 */
  snapshot: TRequirementChangeSnapshot;
  /** 这一版当时的字段结构。字段结构立即生效不走审批，没有它旧版本会拿今天的表头渲染 */
  fields_snapshot: TRequirementField[];
  approved_by: string[];
  change_request_id: string | null;
  change_request_sequence_id: number | null;
  change_request_reason: string | null;
  created_by: string | null;
  created_by_detail: IUserLite | null;
  created_at: string;
};

/**
 * 基线快照 —— 一组 (需求, 版本) 的不可变命名快照，语义等同 git tag。
 *
 * 内容创建后不可改，能改的只有名字和说明。想「更新基线」就再打一份新的。
 */
export type TRequirementBaseline = {
  id: string;
  product_id: string;
  project_id: string | null;
  name: string;
  description: string;
  /** 收录了多少条需求。创建那一刻定死 */
  entry_count: number;
  requirement_type_stats: TRequirementBaselineTypeStat[];
  created_by: string | null;
  created_by_detail: IUserLite | null;
  created_at: string;
};

export type TRequirementBaselineTypeStat = {
  id: string;
  name: string;
  logo_props?: Partial<TLogoProps>;
  requirement_count: number;
};

/** 没能纳入基线的需求：只有通过过审批的需求才进基线 */
export type TRequirementBaselineSkipped = {
  requirement_id: string;
  title: string;
  reason: "no_approved_version";
};

/**
 * 纳入了，但纳入的不是行上此刻的内容。
 *
 * in_review = 正在评审中，按上一个已通过版本收录；modified = 已通过后又改过。
 * 这件事必须在打基线**之前**就说清楚，所以创建接口支持 dry-run。
 */
export type TRequirementBaselineStale = {
  requirement_id: string;
  title: string;
  version: number;
  reason: "in_review" | "modified";
};

/** 打基线的范围 */
export type TRequirementBaselineScope = "all" | "by_type" | "by_requirement";

export type TRequirementBaselinePayload = {
  name?: string;
  description?: string;
  scope?: TRequirementBaselineScope;
  requirement_type_ids?: string[];
  requirement_ids?: string[];
};

/** dry-run 的结果：只算不写 */
export type TRequirementBaselinePreview = {
  preview: true;
  entry_count: number;
  skipped: TRequirementBaselineSkipped[];
  stale: TRequirementBaselineStale[];
};

/**
 * 创建结果。skipped / stale 只在创建时返回一次 —— 它们描述的是「打这一份时的现场」，
 * 不是基线本身的属性。
 */
export type TRequirementBaselineCreated = TRequirementBaseline & {
  skipped: TRequirementBaselineSkipped[];
  stale: TRequirementBaselineStale[];
};

/** 基线里的一条：内容与字段结构都取自被收录的那一版，不跟随需求现状 */
export type TRequirementBaselineEntry = {
  id: string;
  requirement_id: string;
  requirement_type_id: string;
  version_id: string;
  version_number: number;
  snapshot: TRequirementChangeSnapshot;
  fields_snapshot: TRequirementField[];
  sort_order: number;
};

export type TRequirementBaselineCompareResponse = TPaginatedResponse<TRequirementDiffItem[]> & {
  from_baseline: { id: string; name: string };
  to_baseline: { id: string; name: string };
};

/**
 * 收件箱里的一张单：比列表项多一个产品名和「我表过什么态」。
 *
 * 收件箱是跨产品的，只给 CR-3 这样的编号人分不出这是哪个产品的单。
 */
export type TRequirementApprovalInboxItem = Omit<TRequirementChangeRequest, "product_id"> & {
  /**
   * 收件箱恒为产品级：端点按 `product__workspace__slug` 过滤，这个 join 天然排除了
   * 没有产品的单。就地审批要拿它拼审批端点的地址，所以这里不能是可空的。
   */
  product_id: string;
  product_name: string;
  /** 我在这张单上的表态；待办页恒为 null，已办页用它区分「我批了」和「我驳了」 */
  my_action: TRequirementApprovalAction | null;
};

/** 信封与工作项的 my-approvals 一致，画角标的逻辑不必写两遍 */
export type TRequirementApprovalInboxResponse = {
  results: TRequirementApprovalInboxItem[];
  pending_count: number;
};

export type TRequirementChangeRequestsResponse = TPaginatedResponse<TRequirementChangeRequest[]>;
export type TRequirementChangeItemsResponse = TPaginatedResponse<TRequirementChangeItem[]>;
export type TRequirementTrailResponse = TPaginatedResponse<TRequirementTrailEntry[]>;
export type TRequirementVersionsResponse = TPaginatedResponse<TRequirementVersion[]>;
export type TRequirementBaselinesResponse = TPaginatedResponse<TRequirementBaseline[]>;
export type TRequirementBaselineEntriesResponse = TPaginatedResponse<TRequirementBaselineEntry[]>;
