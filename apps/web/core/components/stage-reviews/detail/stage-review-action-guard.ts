import type { TStageReviewDetail } from "@plane/types";
import { EStageReviewStatus } from "@plane/types";

export type TStageReviewActionBlock = "no_leader" | "not_leader" | "no_auditor" | "not_auditor";

export type TStageReviewActionGuard =
  | { allowed: true }
  | { allowed: false; reason: TStageReviewActionBlock; ownerName: string };

type TOwnerField = "leader" | "auditor";

/** 每个状态由谁推进 / 退回，与后端 utils/stage_review.py 的 STEP_OWNER_FIELD 一致 */
const STEP_OWNER_FIELD: Partial<Record<EStageReviewStatus, TOwnerField>> = {
  [EStageReviewStatus.NOT_STARTED]: "leader",
  [EStageReviewStatus.IN_REVIEW]: "leader",
  [EStageReviewStatus.IN_APPROVAL]: "auditor",
};

const ALLOWED: TStageReviewActionGuard = { allowed: true };

const checkOwner = (
  detail: TStageReviewDetail,
  field: TOwnerField,
  currentUserId: string | undefined
): TStageReviewActionGuard => {
  const ownerId = field === "leader" ? detail.leader_id : detail.auditor_id;
  const ownerName = (field === "leader" ? detail.leader_detail : detail.auditor_detail)?.display_name ?? "";
  if (!ownerId) return { allowed: false, reason: field === "leader" ? "no_leader" : "no_auditor", ownerName };
  if (ownerId !== currentUserId) {
    return { allowed: false, reason: field === "leader" ? "not_leader" : "not_auditor", ownerName };
  }
  return ALLOWED;
};

/**
 * 动作条上「推进」与「退回」能不能点。规则以后端为准（utils/stage_review.py 的
 * `_assert_step_owner`），这里只是提前把按钮置灰、把原因写出来：
 *
 * - 未评审 / 评审中归负责人，审核中归审核者，推进和退回都只认这一步的主人本人，不允许代推；
 * - 提交审核（评审中那一跳）另外要求已指定审核者。
 *
 * 项目管理权限（canManage）是前提，不在这里判断。
 */
export const getStageReviewActionGuard = (
  detail: TStageReviewDetail,
  currentUserId: string | undefined
): { advance: TStageReviewActionGuard; rollback: TStageReviewActionGuard } => {
  const field = STEP_OWNER_FIELD[detail.status];
  // 已评审是终态：动作条本来就不出推进 / 退回按钮，后端也会挡，这里不再判人
  if (!field) return { advance: ALLOWED, rollback: ALLOWED };

  const owner = checkOwner(detail, field, currentUserId);
  let advance = owner;
  if (owner.allowed && detail.status === EStageReviewStatus.IN_REVIEW && !detail.auditor_id) {
    advance = { allowed: false, reason: "no_auditor", ownerName: "" };
  }
  return { advance, rollback: owner };
};
