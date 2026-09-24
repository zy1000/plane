import type { IUserLite } from "./users";

/**
 * 评审裁剪：项目级的「产品 × 评审模板节点」勾选矩阵。
 *
 * 勾上 = 这个产品在这个阶段要做这个评审，签批通过后生成正式评审（StageReview）；
 * 不勾 = 裁剪掉，必须写裁剪原因。改动走**原地修订**：同一张表在已生效与修订中之间
 * 往返，不复制新表。
 */

export enum EReviewTailoringStatus {
  DRAFT = "draft",
  PENDING = "pending",
  APPROVED = "approved",
  REVISING = "revising",
}

/** 裁剪类型：决定纵轴只能从哪一族节点里挑。建表时定下，之后只读 */
export enum EReviewTailoringKind {
  /** 过程评审裁剪：review / activity */
  PROCESS = "process",
  /** O阶段评审裁剪：o_stage_review / o_stage_activity */
  O_STAGE = "o_stage",
}

/** 可编辑的两个状态：勾选、加产品、提交签批都只在这里面允许 */
export const REVIEW_TAILORING_EDITABLE_STATUSES: EReviewTailoringStatus[] = [
  EReviewTailoringStatus.DRAFT,
  EReviewTailoringStatus.REVISING,
];

/** 签批通过规则。没有 none —— 裁剪表必须有人签批 */
export type TReviewTailoringApprovalType = "any" | "all" | "n_of_m";

export type TReviewTailoringApprovalAction = "approved" | "rejected";

export type TReviewTailoringApproval = {
  id: string;
  approver: string;
  approver_detail: IUserLite | null;
  round: number;
  /** null = 这一轮里这个人还没表态 */
  action: TReviewTailoringApprovalAction | null;
  comment: string;
  acted_at: string | null;
  created_at: string;
};

/** 矩阵横轴的一列 */
export type TReviewTailoringProduct = {
  id: string;
  name: string;
  code: string;
  identifier: string;
};

/**
 * 矩阵纵轴的一行 = 纵轴展开后的一个模板节点。
 *
 * 行**不从格子反推**：刚加完评审还没加产品的表一个格子都没有，但行必须画得出来。
 */
/**
 * 矩阵纵轴的一行 = **项目阶段 × 模板节点**。
 *
 * 同一个模板节点在父子 / 同类型阶段下各占一行，所以行的身份是
 * `${stage_id}:${template_id}`，单独的 `template_id` 认不出是哪一行。
 */
export type TReviewTailoringRow = {
  template_id: string;
  /** 评审活动指向它所属的评审；顶层节点为 null */
  parent_template_id: string | null;
  /** 项目阶段（ProjectStage），不是评审树上的阶段类型 */
  stage_id: string;
  stage_label: string;
  /** 树先序的秩（后端算好），按它排就是父在前、子紧跟 */
  stage_sort_order: number;
  stage_parent_id: string | null;
  stage_depth: number;
  kind: string;
  title: string;
  sort_order: number;
  /**
   * 「挪进来才有的行」：评审活动挪到一个模式里没勾它的阶段后，后端补出这一行，
   * 这里是格子原来的阶段（画「自 X」徽章）。纵轴本来就有的行为 null
   */
  origin_stage_id: string | null;
  origin_stage_label: string | null;
};

/** 「添加评审」清单里的一条：项目阶段 × 可选节点。`in_matrix` = 这个节点已经在纵轴上 */
export type TReviewTailoringAxisOption = {
  stage_id: string;
  stage_label: string;
  stage_sort_order: number;
  stage_parent_id: string | null;
  stage_depth: number;
  template_id: string;
  parent_template_id: string | null;
  kind: string;
  title: string;
  sort_order: number;
  in_matrix: boolean;
};

/** 矩阵里的一个格子 = (产品, 项目阶段, 模板节点) */
export type TReviewTailoringItem = {
  id: string;
  product_id: string;
  template_id: string;
  /** 评审活动指向它所属的评审；顶层节点为 null。前端靠它把纵轴折成树 */
  parent_template_id: string | null;
  /** 格子落在项目的哪个阶段。纵轴跨全部阶段（父子皆有），前端靠这几个字段折成分组 */
  stage_id: string;
  stage_label: string;
  stage_sort_order: number;
  stage_parent_id: string | null;
  stage_depth: number;
  /** 评审活动挪过阶段时，纵轴上本来那一格的阶段；没挪过（或挪回原处）为 null */
  origin_stage_id: string | null;
  origin_stage_label: string | null;
  /** 生效快照里这一格所在的阶段；从未生效、或修订期间才补进来的格子为 null */
  effective_stage_id: string | null;
  kind: string;
  template_is_active: boolean;
  template_sort_order: number;
  /** 模板标题的快照，模板改名后历史表仍显示当时的口径 */
  title: string;
  selected: boolean;
  /** 未勾选时必填（提交签批时校验）；勾上的格子恒为空 */
  reason: string;
  stage_review_id: string | null;
  /** 已生成评审做到哪一步了：completed 的不许被裁掉 */
  stage_review_status: string | null;
  created_by_detail: IUserLite | null;
  created_at: string;
};

export type TReviewTailoring = {
  id: string;
  project_id: string;
  workspace_id: string;
  title: string;
  status: EReviewTailoringStatus;
  tailoring_kind: EReviewTailoringKind;
  /** 生效次数，0 = 从未生效 */
  revision: number;
  /** 签批轮次，每提交一次 +1 */
  round: number;
  approval_type: TReviewTailoringApprovalType | "";
  required_count: number | null;
  product_count: number;
  /** 纵轴上的顶层评审数（不含它们下面的评审活动） */
  review_count: number;
  item_count: number;
  selected_count: number;
  /** 以下四个列表与详情接口都会算（后端 attach_list_progress / attach_detail_progress） */
  /** 本轮签批人数 / 已通过人数（签批中） */
  approval_total: number;
  approval_approved: number;
  /** 已生成评审实例的格子数（已生效） */
  generated_count: number;
  /** 修订期间相对生效快照改了几格（修订中） */
  pending_change_count: number;
  /** 当前用户是本轮签批人且还没表态（列表接口按请求人算，详情里恒为 false，看 approvals） */
  my_approval_pending: boolean;
  /** 当前用户在本轮的结论；不是签批人或还没表态为 null */
  my_approval_action: TReviewTailoringApprovalAction | null;
  created_by_detail: IUserLite | null;
  submitted_by_detail: IUserLite | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  approved_at: string | null;
};

/** 修订相对生效快照的一条改动（签批弹窗「改动明细」）。从未生效过的表没有 */
export type TReviewTailoringChange = {
  type: "add" | "cancel" | "move";
  item_id: string;
  product_id: string;
  template_id: string;
  title: string;
  stage_id: string;
  stage_label: string;
  /** 以下只有 move 有 */
  old_stage_id?: string;
  old_stage_label?: string;
  /** 挪的是已评审的活动：签批生效时会被跳过 */
  will_skip?: boolean;
};

/** 「移到阶段」候选：本项目的全部阶段（父子皆有，树先序）。键名沿用 mode_stages */
export type TReviewTailoringModeStage = {
  id: string;
  name: string;
  /** 阶段类型的编码（M010 …） */
  code: string;
  /** 树先序的秩 */
  sort_order: number;
  stage_type_name: string;
  parent_id: string | null;
  depth: number;
};

/** 生效时被跳过的一条移动（签批时活动已评审） */
export type TReviewTailoringSkippedMove = {
  item_id: string;
  product_id: string;
  title: string;
  /** 实例仍在的阶段 */
  stage_id: string;
  stage_label: string;
  target_stage_id: string;
  target_stage_label: string;
  reason: "completed";
};

export type TReviewTailoringDetail = TReviewTailoring & {
  description_html: string | null;
  items: TReviewTailoringItem[];
  products: TReviewTailoringProduct[];
  rows: TReviewTailoringRow[];
  /** 只有本轮的签批行；历史轮次留在变更历史里 */
  approvals: TReviewTailoringApproval[];
  pending_changes: TReviewTailoringChange[];
  /** 项目研发模式的全部阶段，按模式顺序。「移到阶段」弹窗的候选 */
  mode_stages: TReviewTailoringModeStage[];
  /** 最近一次生效被跳过的移动，只在已生效态给 */
  last_skipped_moves: TReviewTailoringSkippedMove[];
  /** 只有「这次签批让表生效」的 act 响应带 */
  apply_result?: {
    created_count: number;
    deleted_count: number;
    moved_count: number;
    skipped: TReviewTailoringSkippedMove[];
  } | null;
};

export type TReviewTailoringActivity = {
  id: string;
  tailoring: string;
  actor: string | null;
  actor_detail: IUserLite | null;
  verb: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  comment: string;
  tailoring_comment: string | null;
  old_identifier: string | null;
  new_identifier: string | null;
  epoch: number | null;
  /** 格子级变更把 product_id / template_id / title 放这里 */
  extra: Record<string, unknown>;
  created_at: string;
};

export type TReviewTailoringComment = {
  id: string;
  workspace: string;
  project: string;
  tailoring: string;
  actor: string | null;
  actor_detail: IUserLite | null;
  comment_stripped: string;
  comment_json: Record<string, unknown>;
  comment_html: string;
  parent: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TCreateReviewTailoringPayload = {
  title: string;
  tailoring_kind: EReviewTailoringKind;
  description_html?: string | null;
};

export type TUpdateReviewTailoringHeaderPayload = {
  title?: string;
  description_html?: string | null;
};

/** 一次加纵轴与横轴：只收顶层评审 id，两边可以只填一边 */
export type TAddReviewTailoringAxesPayload = {
  template_ids: string[];
  product_ids: string[];
};

export type TReviewTailoringCellPayload = {
  id: string;
  selected?: boolean;
  reason?: string;
  /** 把评审活动挪到本项目模式的另一个阶段 */
  stage_id?: string;
};

export type TSubmitReviewTailoringPayload = {
  approval_type: TReviewTailoringApprovalType;
  required_count: number | null;
  approver_ids: string[];
};

export type TActReviewTailoringPayload = {
  action: TReviewTailoringApprovalAction;
  comment?: string;
};
