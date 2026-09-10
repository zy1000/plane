import type { TDataDictionaryItemLite } from "./data-dictionary";
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

/** 矩阵里的一个格子 = (产品, 模板节点) */
export type TReviewTailoringItem = {
  id: string;
  product_id: string;
  template_id: string;
  /** 评审活动指向它所属的评审；顶层节点为 null。前端靠它把纵轴折成树 */
  parent_template_id: string | null;
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
  stage_id: string;
  stage_detail: TDataDictionaryItemLite | null;
  status: EReviewTailoringStatus;
  /** 生效次数，0 = 从未生效 */
  revision: number;
  /** 签批轮次，每提交一次 +1 */
  round: number;
  approval_type: TReviewTailoringApprovalType | "";
  required_count: number | null;
  product_count: number;
  item_count: number;
  selected_count: number;
  created_by_detail: IUserLite | null;
  submitted_by_detail: IUserLite | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  approved_at: string | null;
};

export type TReviewTailoringDetail = TReviewTailoring & {
  description_html: string | null;
  items: TReviewTailoringItem[];
  products: TReviewTailoringProduct[];
  /** 只有本轮的签批行；历史轮次留在变更历史里 */
  approvals: TReviewTailoringApproval[];
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
  description_html?: string | null;
  stage_id: string;
  product_ids: string[];
};

export type TUpdateReviewTailoringHeaderPayload = {
  title?: string;
  description_html?: string | null;
};

export type TReviewTailoringCellPayload = {
  id: string;
  selected?: boolean;
  reason?: string;
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
