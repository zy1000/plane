import type { TDataDictionaryItemLite } from "./data-dictionary";

/**
 * 评审模板库：工作区级的标准研发流程。
 *
 * 树最多两层 —— 评审恒在顶层；评审活动可以挂在同族的评审下（parent_id 指向它），
 * 也可以直接挂在阶段下（parent_id 为 null，有些阶段没有汇总评审）。
 * 阶段引用的是 product_stage 数据字典的值。
 */

export enum EStageReviewKind {
  REVIEW = "review",
  ACTIVITY = "activity",
  O_STAGE_REVIEW = "o_stage_review",
  O_STAGE_ACTIVITY = "o_stage_activity",
}

/** 顶层类型：不能有父 */
export const STAGE_REVIEW_ROOT_KINDS: EStageReviewKind[] = [
  EStageReviewKind.REVIEW,
  EStageReviewKind.O_STAGE_REVIEW,
];

/** 活动类型：可以有父，也可以直接挂阶段 */
export const STAGE_REVIEW_ACTIVITY_KINDS: EStageReviewKind[] = [
  EStageReviewKind.ACTIVITY,
  EStageReviewKind.O_STAGE_ACTIVITY,
];

/** 父子必须同族：根类型 → 它下面唯一合法的活动类型 */
export const STAGE_REVIEW_ACTIVITY_KIND_BY_ROOT: Record<string, EStageReviewKind> = {
  [EStageReviewKind.REVIEW]: EStageReviewKind.ACTIVITY,
  [EStageReviewKind.O_STAGE_REVIEW]: EStageReviewKind.O_STAGE_ACTIVITY,
};

export type TStageReviewTemplate = {
  id: string;
  workspace_id: string;
  stage_id: string;
  stage_detail: TDataDictionaryItemLite;
  parent_id: string | null;
  kind: EStageReviewKind;
  title: string;
  description_html: string | null;
  /** 三个角色存的都是**角色名称文本**而不是人；审核者为空串 = 无需审核 */
  initiator_role: string;
  leader_role: string;
  auditor_role: string;
  is_active: boolean;
  sort_order: number;
  child_count: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TCreateStageReviewTemplatePayload = {
  stage_id: string;
  parent_id?: string | null;
  kind: EStageReviewKind;
  title: string;
  description_html?: string | null;
  initiator_role?: string;
  leader_role?: string;
  auditor_role?: string;
  is_active?: boolean;
};

export type TUpdateStageReviewTemplatePayload = Partial<TCreateStageReviewTemplatePayload>;
