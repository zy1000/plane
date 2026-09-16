import type { TLogoProps } from "./common";
import type { TDataDictionaryItemLite } from "./data-dictionary";
import type { EStageReviewKind } from "./stage-review-template";
import type { IUserLite } from "./users";

/**
 * 阶段评审实例：裁剪表签批生效后，勾中的格子变成的一条条真实评审。
 *
 * **评审与评审活动是同一张表的两行**，只有层级不同（`kind` + `parent_id`），列表与
 * 详情抽屉共用同一套结构；父评审不汇总子活动的结论，各自独立评审。
 *
 * 状态只能顺着走：未评审 → 评审中 → 审核中 → 已评审，没有「直接改成某个状态」的写
 * 入口，所以前端也不该出现状态下拉框。「提交审核」的落点由结论决定：不通过留在评审中，
 * 免审直接已评审，通过 / 条件通过进审核中。
 */

export enum EStageReviewStatus {
  NOT_STARTED = "not_started",
  IN_REVIEW = "in_review",
  IN_APPROVAL = "in_approval",
  COMPLETED = "completed",
}

/** 四步流程条的顺序，也是「下一步 / 上一步」的唯一依据 */
export const STAGE_REVIEW_STATUS_ORDER: EStageReviewStatus[] = [
  EStageReviewStatus.NOT_STARTED,
  EStageReviewStatus.IN_REVIEW,
  EStageReviewStatus.IN_APPROVAL,
  EStageReviewStatus.COMPLETED,
];

export enum EStageReviewResult {
  PASSED = "passed",
  REJECTED = "rejected",
  WAIVED = "waived",
  CONDITIONAL = "conditional",
}

/** 生产方式 / 出货评估只在 O 阶段的两种类型上出现 */
export type TProductionMode = "normal" | "risk";
export type TShipmentAssessment = "normal" | "refresh" | "risk";

export const PRODUCTION_MODES: TProductionMode[] = ["normal", "risk"];
export const SHIPMENT_ASSESSMENTS: TShipmentAssessment[] = ["normal", "refresh", "risk"];

/** 列表按产品分组，分组头要的就是这四个字段 */
export type TStageReviewProduct = {
  id: string;
  name: string;
  code: string;
  identifier: string;
};

/** 所属项目：产品页横跨多个项目，按项目分组 / 项目列 / 抽屉面包屑都靠它 */
export type TStageReviewProject = {
  id: string;
  name: string;
  identifier: string;
  logo_props: TLogoProps;
};

export type TStageReview = {
  id: string;
  project_id: string;
  project_detail: TStageReviewProject | null;
  workspace_id: string;
  product_id: string;
  product_detail: TStageReviewProduct | null;
  stage_id: string;
  /** 评审活动指向它所属的评审；顶层评审为 null。前端靠它把列表折成两层 */
  parent_id: string | null;
  /** 来源模板节点，null = 手工新建（不进裁剪表） */
  template_id: string | null;
  /** 来源裁剪表，null = 手工新建。多张表都保留同一个评审时，靠它区分同名行 */
  tailoring_id: string | null;
  tailoring_title: string | null;
  kind: EStageReviewKind;
  title: string;
  status: EStageReviewStatus;
  /** 空串 = 还没有结论 */
  result: EStageReviewResult | "";
  leader_id: string | null;
  leader_detail: IUserLite | null;
  auditor_id: string | null;
  auditor_detail: IUserLite | null;
  start_date: string | null;
  end_date: string | null;
  attachment_count: number;
  comment_count: number;
  is_manual: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TStageReviewDetail = TStageReview & {
  stage_detail: TDataDictionaryItemLite | null;
  /** 评审活动才有：所属评审的标题，只用来画面包屑 */
  parent_title: string | null;
  description_html: string | null;
  work_instruction: string;
  conditional_reason: string;
  /** 模板上快照下来的角色名称文本，负责人候选人按它从产品成员里筛 */
  initiator_role: string;
  leader_role: string;
  auditor_role: string;
  production_mode: TProductionMode | "";
  shipment_assessment: TShipmentAssessment | "";
  /** 成品：只有「O阶段评审」有值 */
  finished_goods: {
    akf_code: string;
    production_quantity: number | null;
    product_config: string;
    baseline_archive_code: string;
    components: string[];
  };
  /** 组件版本：同样只有「O阶段评审」有值，这一组只有「版本」一个子属性 */
  component_versions: { version: string };
  created_by: string | null;
};

/** 左栏的一个阶段：只列出真的有评审的阶段，四个状态各自的条数给分段进度条用 */
export type TStageReviewStageSummary = {
  stage_id: string;
  label: string;
  total: number;
  /** 只有产品级汇总有：这个阶段的评审分布在几个项目里 */
  project_count?: number;
  not_started: number;
  in_review: number;
  in_approval: number;
  completed: number;
};

/**
 * 产品页的阶段评审：关联项目里这个产品的全部评审（只含当前用户能看的项目）。
 * `linked_project_count` 为 0 时是「还没有关联项目」，而不是「关联了但还没生成评审」。
 */
export type TProductStageReviewsResponse = {
  linked_project_count: number;
  linked_project_ids: string[];
  reviews: TStageReview[];
};

export type TStageReviewComment = {
  id: string;
  workspace: string;
  project: string;
  stage_review: string;
  actor: string | null;
  actor_detail: IUserLite | null;
  comment_stripped: string;
  comment_json: unknown;
  comment_html: string;
  parent: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TStageReviewActivity = {
  id: string;
  stage_review: string;
  actor: string | null;
  actor_detail: IUserLite | null;
  verb: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  /** 负责人 / 审核者这类成员字段：值是显示名，identifier 是用户 id；老记录为空 */
  old_identifier: string | null;
  new_identifier: string | null;
  comment: string;
  stage_review_comment: string | null;
  extra: Record<string, unknown>;
  created_at: string;
};

export type TStageReviewAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  is_uploaded: boolean;
  created_at: string;
  created_by_id: string | null;
  created_by_detail: IUserLite | null;
};

/**
 * 负责人 / 审核者的候选人。`source` 是这批人从哪一层找出来的：
 * `product` 该产品下担任这个角色的人 → `workspace` 工作区里担任这个角色的人 →
 * `project` 都没有，回落到全部项目成员。
 */
export type TStageReviewCandidateSource = "product" | "workspace" | "project";

export type TStageReviewCandidates = {
  role_name: string;
  source: TStageReviewCandidateSource;
  results: IUserLite[];
};

export type TCreateStageReviewPayload = {
  product_id: string;
  stage_id: string;
  kind: EStageReviewKind;
  parent_id?: string | null;
  title: string;
  description_html?: string;
  work_instruction?: string;
  leader_id?: string | null;
  auditor_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

/** 详情里能改的字段。**status 与 result 不在其中** —— 那两列只能由动作推进 */
export type TUpdateStageReviewPayload = Partial<{
  title: string;
  description_html: string;
  work_instruction: string;
  leader: string | null;
  auditor: string | null;
  start_date: string | null;
  end_date: string | null;
  akf_code: string;
  production_quantity: number | null;
  product_config: string;
  baseline_archive_code: string;
  components: string[];
  component_version: string;
}>;

/**
 * 提交审核时的结论。除「通过」外都必须带结论说明（conditional_reason），O 阶段必须带
 * 生产方式与出货评估。落点由结论决定：不通过留在评审中，其余进审核中。
 */
/**
 * 退回上一步的理由，必填。它只进轨迹（`extra.rollback_reason`），不落在评审字段上 ——
 * 一条评审可以被退回多次，每次的理由都属于那一次事件。与结论说明不是同一项。
 */
export type TRollbackStageReviewPayload = {
  reason: string;
};

export type TSubmitStageReviewPayload = {
  result: EStageReviewResult;
  conditional_reason?: string;
  production_mode?: TProductionMode | "";
  shipment_assessment?: TShipmentAssessment | "";
};
