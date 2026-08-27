import type { TLogoProps } from "./common";
import type { TPaginatedResponse } from "./pagination";
import type { TStateGroups } from "./state";
import type { IUserLite } from "./users";

/** 通过规则；none = 无需评审，提交即自动通过 */
export type TRequirementApprovalType = "none" | "any" | "all" | "n_of_m";
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
/**
 * 需求级的**交付状态**，跨项目共享一份，人工维护。不表达评审进度 —— 那是另一根轴，
 * 见 TRequirementApprovalState；两根轴正交，评审中的行也能改状态。
 *
 * 写入口与内容 PATCH 分开（产品侧 PATCH .../requirements/{id}/status/、项目侧
 * PATCH projects/{pid}/requirements/{rid}/ 带 status），不 bump 乐观锁 version。
 * 只有两条只升不降的自动推进：关联进项目 not_started → projected；发布单发布成功
 * → released。closed（已关闭）内容只读、不进任何关联选择器，选回任意非 closed 值即重开。
 */
export type TRequirementItemStatus = "not_started" | "projected" | "in_progress" | "released" | "closed";

/** 状态全序（下拉与分布条按此顺序渲染）。closed 在阶梯之外，排最后 */
export const REQUIREMENT_STATUSES: TRequirementItemStatus[] = [
  "not_started",
  "projected",
  "in_progress",
  "released",
  "closed",
];

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
export const REQUIREMENT_APPROVAL_STATES: TRequirementApprovalState[] = [
  "draft",
  "in_review",
  "pending_deletion",
  "approved",
  "modified",
];
/** 与工作项优先级取值一致，可直接复用工作项的优先级下拉 */
export type TRequirementPriority = "urgent" | "high" | "medium" | "low" | "none";
export const REQUIREMENT_PRIORITIES: TRequirementPriority[] = ["urgent", "high", "medium", "low", "none"];

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
 * 可排序的内置字段键。title 是结构列（网格左固定，与编号一起锁定在最前），
 * 不入 builtin_fields 布局；code 不是内置列（见 TRequirement.code 的注释）。
 */
export type TRequirementBuiltinSortableKey = Exclude<TRequirementBuiltinKey, "title">;

/**
 * 读侧：一个需求类型的内置字段布局项，来自各配置接口的 builtin_fields。
 * sort_order 与自定义字段的 sort_order 同一个排序空间，消费端按 sort_order 归并出
 * 统一列序（相等时内置在前）。status 的 show_in_library 恒为 false（服务端强制）。
 */
export type TRequirementBuiltinFieldConfig = {
  key: TRequirementBuiltinSortableKey;
  show_in_library: boolean;
  sort_order: number;
};

/**
 * 写侧：PUT 需求类型配置时的内置字段布局项。position 是「7 个可排序内置列 +
 * 自定义根字段」统一列表里的 0 基下标，服务端按统一槽位给两边重算 sort_order。
 */
export type TRequirementBuiltinFieldPayload = {
  key: TRequirementBuiltinSortableKey;
  show_in_library: boolean;
  position: number;
};

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
  /**
   * 作用域内自增序号，服务端分配、永不复用（软删的行也占着号）。
   *
   * 这一组编号字段全部**只读**，刻意放在 TRequirementBuiltinValues 之外 ——
   * 那个类型同时是写载荷（TRequirementBatchCreate.builtin），而 pickBuiltinValues
   * 会把它整组回传给服务端，编号进去就成了客户端可伪造的输入。
   */
  sequence_id: number;
  /**
   * 标准库条目的手填编号（任意文本，不校验格式，库内唯一非空）；
   * 产品/项目行恒为 null。写入走 create/update 载荷的顶层 code 字段 ——
   * 同样刻意不进 TRequirementBuiltinValues，产品路径不该能写编号。
   */
  code: string | null;
  /**
   * 展示编号。产品/项目行是服务端拼的 "ECOM-1"（前缀取自 identifier）；
   * 库条目就是手填的 code。
   */
  display_id: string | null;
  /** 从标准库导入时的出处；手工录入的行三个 source_* 都是 null */
  source_library_id: string | null;
  source_sequence_id: number | null;
  /** 拼好的来源编号，如 "SEC-12"。库改名后会自动跟随 */
  source_display_id: string | null;
  /**
   * 模块挂靠；null = 未挂靠（只在「全部」里展示）。模块不是需求内容：
   * 不进 builtin / 版本快照 / 变更单 diff，改挂靠走 set-module 端点，不触发审批。
   */
  module_id: string | null;
  /** 模块名，服务端随行拍平（网格模块列 / 详情抽屉直接用） */
  module_name: string | null;
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
  /**
   * 这条需求被哪些项目引用（RequirementProject）。
   *
   * 只有产品需求列表会注解它 —— 详情页的「所属项目」多选靠它回显。别处恒为 []，
   * 不是 undefined，所以调用方不必到处补 ?? []。
   */
  project_ids: string[];
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
  /** 进不进标准库。默认进；表单与子字段各自独立设置 */
  show_in_library: boolean;
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

/** 基线引用到的一个需求类型：id/name/图标 + 该类型的字段树 */
export type TRequirementTypeSchema = {
  id: string;
  name: string;
  /** 图标配置，与工作项类型同形状；字段结构会随版本冻结，图标不会 */
  logo_props?: Partial<TLogoProps>;
  fields: TRequirementField[];
  /** 内置字段布局。与图标同规则：不冻结、实时取自类型。旧缓存可能没有，缺省=内置在前 */
  builtin_fields?: TRequirementBuiltinFieldConfig[];
};

/**
 * 需求配置：只读的写权限、待审计数与网格字段。
 *
 * 评审人与通过规则不在这里 —— 它们随每次提交评审在弹窗里给定，只对那一张变更单有效。
 */
export type TRequirementConfiguration = {
  /** 能不能录入/修改需求条目；项目侧恒为 false（写入权在产品上） */
  can_edit: boolean;
  /** 一个产品下可以同时有多张待审单，所以给计数而不是单个 id；项目侧恒为 0 */
  pending_change_request_count: number;
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
  /** 左侧树选中模块后新建自动挂靠；服务端校验模块与作用域一致 */
  module_id?: string | null;
  /** 库条目手填编号，库作用域必填；产品/项目路径传了会被服务端拒绝 */
  code?: string;
};

export type TRequirementBatchUpdate = {
  id: string;
  data: TRequirementData;
  builtin: TRequirementBuiltinValues;
  version: number;
  /** 库条目手填编号；不带 = 不改。产品/项目路径不接受 */
  code?: string;
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
  /** 库内条目编号的前缀（SEC-12 里的 SEC），也是导入后目标行溯源显示的前缀 */
  identifier: string;
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
  identifier: string;
  requirement_type_id: string;
  description?: string;
};

/** requirement_type_id 创建后不可变——换类型会让库内已填数据全部失效 */
export type TUpdateRequirementLibraryPayload = Partial<
  Pick<TRequirementLibrary, "name" | "identifier" | "description" | "is_active">
>;

/** 条目网格的表头：字段来自库所选的需求类型，只读 */
export type TRequirementLibraryConfiguration = {
  library: TRequirementLibrary;
  fields: TRequirementField[];
  /** 内置字段布局，完整 7 项（带 show_in_library 标志），库场景由前端解析层过滤 */
  builtin_fields?: TRequirementBuiltinFieldConfig[];
  /** 乐观锁基准，取的是需求类型的 updated_at——改字段动的是类型 */
  expected_updated_at: string;
};

/* --- 需求模块 ----------------------------------------------------------- */

/**
 * 需求模块树节点。标准库 / 产品各自维护一棵独立的树；库条目导入产品时按
 * 名称路径逐级匹配 / 创建。
 */
export type TRequirementModule = {
  id: string;
  name: string;
  /** 父模块 id；null = 根级 */
  parent: string | null;
  sort_order: number;
  /** 子树累加计数（本模块与全部后代下的需求数），与列表 module_id 过滤口径一致 */
  count: number;
  children: TRequirementModule[];
};

export type TRequirementModuleTreeResponse = {
  modules: TRequirementModule[];
  /** 作用域内全部需求数（含未挂靠的行），「全部」节点的计数 */
  total: number;
};

/** 模块归属：库模块与产品模块相互独立，两组 URL 前缀 */
export type TRequirementModuleScope = { libraryId: string } | { productId: string };

export type TCreateRequirementModulePayload = {
  name: string;
  parent?: string | null;
  sort_order?: number;
};

export type TUpdateRequirementModulePayload = Partial<TCreateRequirementModulePayload>;

/** module_id 必传：显式 null 才是「移回全部（取消挂靠）」 */
export type TSetRequirementModulePayload = {
  requirement_ids: string[];
  module_id: string | null;
};

/** 项目需求页左侧只读模块树的一个产品分组 */
export type TProjectRequirementModuleGroup = {
  product_id: string;
  product_name: string;
  product_identifier: string;
  /** 该产品已关联进本项目的需求数（含未挂靠模块的行） */
  total: number;
  /** 已剪掉子树计数为 0 分支的树（祖先闭包） */
  modules: TRequirementModule[];
};

export type TProjectRequirementModulesResponse = {
  products: TProjectRequirementModuleGroup[];
  total: number;
};

export type TRequirementsResponse = TPaginatedResponse<TRequirement[]>;

/**
 * 关联需求弹窗左侧产品分面的计数。
 *
 * 口径由服务端定死（utils/requirement_project.linkable_facets）：统计整个候选池，
 * 不随搜索与产品筛选变化。前端不要再二次加工这些数字。
 */
export type TLinkableRequirementFacets = {
  /** product_id -> 候选数；没有候选的产品不出现在键里 */
  by_product: Record<string, number>;
  total: number;
};

export type TLinkableRequirementsResponse = Omit<TPaginatedResponse<TRequirement[]>, "extra_stats"> & {
  extra_stats?: TLinkableRequirementFacets | null;
};

/* --- 需求进项目（RequirementProject） -------------------------------------- */

/** 项目侧看到的一条需求：需求内容（含需求级 status）+ 本项目内的关联信息。网格只读，抽屉按产品 can_edit 决定能不能改内容。 */
export type TProjectRequirement = TRequirement & {
  /** 关联行上的排序，与需求本体的 sort_order 是两个数 */
  link_sort_order: number | null;
  product_name: string | null;
  /** 产品标识（ECOM），画所属产品 chip 的徽标要它 */
  product_identifier: string | null;
  /** 最新在途/已发布发布单名（已发布的优先），目标发布 chip 用；无关联为 null */
  latest_release_name: string | null;
  /** live 关联工作项数 */
  issue_count: number;
  /** 关联工作项中 state.group=completed 的条数。完成率 = completed / (issue_count − cancelled)，由前端算 */
  completed_issue_count: number;
  /** 关联工作项中 state.group=cancelled 的条数——完成率分母的扣减项 */
  cancelled_issue_count: number;
  /**
   * 未取消迭代关联的迭代 id。「拆分工作项」在 length === 1 时预填迭代；
   * 多个迭代不猜，留给用户在创建弹窗里自己选。
   */
  linked_cycle_ids: string[];
};

/**
 * 项目需求页顶部分面的计数。
 *
 * 口径由服务端定死（utils/requirement_project.requirement_facets）：
 * `by_product` 是全集、不随任何筛选变化；`by_status` / `by_requirement_type` 只跟随
 * 当前选中的产品，不跟随搜索与它们自身。前端不要再二次加工这些数字。
 */
export type TProjectRequirementFacets = {
  by_product: { product_id: string; name: string; identifier: string; count: number }[];
  /** 全部状态的键恒存在（含 0），状态条段数固定 */
  by_status: Record<TRequirementItemStatus, number>;
  by_requirement_type: Record<string, number>;
  total: number;
};

export type TProjectRequirementsResponse = Omit<
  TPaginatedResponse<TProjectRequirement[]>,
  "extra_stats"
> & {
  /** 项目需求列表带分面；迭代/发布容器的需求列表复用同一信封，但不带分面 */
  extra_stats?: TProjectRequirementFacets | null;
};

/** profile「需求」tab 的分面：没有需求类型计数，但把类型 schema 带上供网格渲染自定义列 */
export type TProfileRequirementFacets = Pick<TProjectRequirementFacets, "by_product" | "by_status" | "total"> & {
  requirement_types: TRequirementTypeSchema[];
};

export type TProfileRequirementsResponse = Omit<TPaginatedResponse<TProjectRequirement[]>, "extra_stats"> & {
  extra_stats?: TProfileRequirementFacets | null;
};

/** 产品 ↔ 项目关联行。项目靠它确定自己能引用哪些产品的需求 */
export type TProductProject = {
  id: string;
  product: string;
  project: string;
  workspace: string;
  product_name: string;
  product_identifier: string;
  project_detail: {
    id: string;
    name: string;
    identifier: string;
    logo_props?: TLogoProps;
  } | null;
  /** 本产品有多少需求进了这个项目 */
  requirement_count: number;
  /**
   * 各状态各多少（需求级状态，跨项目共享一份 —— 同一条需求进了几个项目就在几个项目
   * 的桶里各计一次）。全部状态的键恒存在（含 0）
   */
  status_counts: Record<TRequirementItemStatus, number>;
  created_at: string;
  created_by: string | null;
};

/**
 * 迭代/发布单批量关联需求的请求体（POST .../cycles|releases/<id>/requirements/）。
 * 解除关联走 DELETE 单条，不用载荷。
 */
export type TRequirementContainerLinkPayload = {
  requirements: string[];
};

/* --- 需求 ↔ 工作项（RequirementIssue） ------------------------------------ */

/**
 * 需求已关联的一条工作项（轻量行，服务端 .values() 直出）。
 *
 * 刻意不是完整的工作项：关联工作项 section 只要编号/标题/状态/负责人几列，不走
 * 工作项网格的重型链路。完成率与状态胶囊配色都按 state_group 判断，不看状态名
 * （状态是项目内自定义的，group 才是稳定的跨项目语义轴）。state 三列随 state_id
 * 可空 —— 无状态的工作项归「未完成未取消」桶：挡 done、不产 in_progress。
 */
export type TRequirementIssue = {
  id: string;
  name: string;
  sequence_id: number;
  priority: TRequirementPriority;
  project_id: string;
  type_id: string | null;
  state_id: string | null;
  state_name: string | null;
  state_group: TStateGroups | null;
  state_color: string | null;
  assignee_ids: string[];
  /** 非空 = 已归档。归档仍是事实（照常计入阶段派生），只在展示上置灰 */
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/* --- 需求 ↔ 测试用例（RequirementTestCase） -------------------------------- */

/**
 * 需求已关联的一条测试用例（轻量行，服务端 .values() 直出）。
 *
 * 刻意不带评审态（TestCase.review 是每行两次查询的 property，列表里就是 N+1），也不带
 * 执行结果 —— 本期只做关联，覆盖率/执行统计留到下一期。
 *
 * type / test_type / priority 是后端的 IntegerChoices 数值（0/1/2…），不是字符串枚举 ——
 * QA 域全部如此，展示映射沿用 components/qa/shared 的胶囊组件。
 */
export type TRequirementTestCase = {
  id: string;
  /** 用例编号，如 ECOM-12。后端按 repository 自增，可能为空串 */
  code: string;
  name: string;
  type: number;
  test_type: number;
  priority: number;
  repository_id: string;
  repository_name: string | null;
  module_id: string | null;
  module_name: string | null;
  /**
   * 用例库所属项目；**为 null 表示跨项目共享用例库**。前端据此打标，也据此解释
   * 「为什么别的项目也看得到这条用例」。
   */
  repository_project_id: string | null;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * 用例侧反查：这条用例挂在哪些需求上。数组 —— 一条用例可以验证多条需求。
 */
export type TTestCaseRequirementLink = {
  requirement_id: string;
  /** 拼好的展示编号（如 ECOM-12）；product 或 sequence_id 缺失时为 null */
  requirement_display_id: string | null;
  requirement_name: string;
  requirement_status: TRequirementItemStatus;
  /** 跳转产品需求详情要它 */
  product_id: string | null;
};

/**
 * 用例侧候选池的一行需求（轻量，服务端手拼）。
 *
 * 刻意不是 TRequirement —— 用例侧的选择器只需要编号/标题/状态/所属产品，走完整需求
 * 序列化器要带上全部自定义字段与审批派生列，选择器一条都用不上。
 */
export type TLinkableCaseRequirement = {
  id: string;
  display_id: string | null;
  name: string;
  status: TRequirementItemStatus;
  product_id: string | null;
  product_name: string | null;
  product_identifier: string | null;
};

/** 用例侧的可关联需求候选池（分页） */
export type TLinkableCaseRequirementsResponse = TPaginatedResponse<TLinkableCaseRequirement[]>;

/** 需求侧的可关联用例候选池（分页）。没有分面 —— 本期不做覆盖率，也没有产品维度可分。 */
export type TLinkableTestCasesResponse = TPaginatedResponse<TRequirementTestCase[]>;

/** 需求侧批量关联用例（POST .../requirements/<rid>/test-cases/）。解除走 DELETE 单条。 */
export type TRequirementTestCaseLinkPayload = {
  test_cases: string[];
};

/** 用例侧批量关联需求（POST .../test/case/<cid>/requirements/）。 */
export type TTestCaseRequirementLinkPayload = {
  requirements: string[];
};

/* --- 从标准库导入 -------------------------------------------------------- */

export type TRequirementImportPayload = {
  library_id: string;
  item_ids: string[];
  before_id?: string;
  after_id?: string;
};

/**
 * 某个产品「还没导过」的库条目，按库分组。
 *
 * 导入弹窗靠它算出每个库的可导条数与三态勾选，以及「勾整库」要提交的那批 id ——
 * 条目列表是分页的，凑不出全量。库里条目全导完时 item_ids 是空数组（库本身仍在）。
 */
export type TRequirementImportableLibrary = {
  library_id: string;
  item_ids: string[];
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

/* --- Excel 导入 / 导出 ---------------------------------------------------- */

/**
 * 需求行的作用域。产品需求与标准库条目共用同一套 Excel 端点，只是路径前缀不同 ——
 * 与 RequirementGrid 的 entityKind 取值保持一致，调用方不用再做一次映射。
 */
export type TRequirementExcelScope = "product" | "library";

/** 一行的校验结果。行号是这条需求在工作表里的**主行**行号，子表续行归到它名下。 */
export type TRequirementExcelRow = {
  sheet: string;
  row_number: number;
  /** `工作表名!行号`。多工作表下光有行号会撞，勾选与回填都用它 */
  row_key: string;
  title: string;
  display_id: string;
  requirement_type_name: string;
  /**
   * create = 新增；update = 按编号更新（内容有变化，或只改了状态）；
   * unchanged = 与现有行完全一致，什么都不做；skip = 命中只读闸门，整行不动
   */
  action: "create" | "update" | "unchanged" | "skip";
  skip_reason: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
};

export type TRequirementExcelValidation = {
  total_count: number;
  create_count: number;
  update_count: number;
  unchanged_count: number;
  skipped_count: number;
  error_count: number;
  all_passed: boolean;
  /** 名字对不上任何需求类型、因而被跳过的工作表 */
  ignored_sheets: string[];
  /** 对不上任何列的表头，形如 `功能需求!我自己加的列` */
  ignored_headers: string[];
  results: TRequirementExcelRow[];
};

export type TRequirementExcelImportResponse = TRequirementExcelValidation & {
  success_count: number;
  created_count: number;
  updated_count: number;
  created_ids: string[];
  /** 本次导入涉及的需求类型。新增可能引入此前没引用过的类型，前端据此重取配置 */
  requirement_type_ids: string[];
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
  show_in_library: boolean;
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
  /**
   * 编号三件套。历史快照（本次改动之前落的那些）里没有这几个 key，所以是可选的 ——
   * 读到 undefined 就不显示编号。
   */
  sequence_id?: number;
  source_library_id?: string | null;
  source_sequence_id?: number | null;
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
  /**
   * 快照里的编号，由服务端用「当前」的产品标识拼出来 —— 产品改标识后历史条目里的
   * 编号跟着变。历史快照没有序号时为 null。
   */
  display_id?: string | null;
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

/**
 * 提交评审时给定的评审人 + 通过规则，只对本次提交的变更单有效。
 *
 * none 时 approver_ids 必须为空、required_count 为 null；n_of_m 时 required_count 在
 * 1..approver_ids.length；其它规则 required_count 为 null。
 */
export type TRequirementApprovalSpec = {
  approval_type: TRequirementApprovalType;
  required_count: number | null;
  approver_ids: string[];
};

/** 提交评审：只发指针不发快照，服务端自己读当前行内容 */
export type TRequirementSubmitReviewPayload = TRequirementApprovalSpec & {
  reason?: string;
  items: {
    requirement_id: string;
    /** 只有 delete 是真的意图；新增与修改由服务端按 approved_version 判定 */
    change_type?: TRequirementChangeType;
  }[];
};

/** 项目侧提单：单条需求，评审人与规则同样由提交人本次指定 */
export type TRequirementProjectSubmitChangePayload = TRequirementApprovalSpec & {
  reason?: string;
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
  /** 这一版快照里的编号，前缀取自当前产品标识；历史快照没有序号时为 null */
  display_id?: string | null;
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
  /** 收录那一版快照里的编号，前缀取自当前产品标识；历史快照没有序号时为 null */
  display_id?: string | null;
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
