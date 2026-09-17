import { EReviewTailoringStatus } from "@plane/types";

/** 页头右侧的挂点：列表组件把搜索 / 过滤 / 新建 portal 进去，状态全留在列表里 */
export const REVIEW_TAILORINGS_HEADER_ACTIONS_ID = "review-tailorings-header-actions";
/** 面包屑后面的数量徽章挂点 */
export const REVIEW_TAILORINGS_HEADER_COUNT_ID = "review-tailorings-header-count";

export const TAILORING_STATUS_ORDER: EReviewTailoringStatus[] = [
  EReviewTailoringStatus.DRAFT,
  EReviewTailoringStatus.PENDING,
  EReviewTailoringStatus.APPROVED,
  EReviewTailoringStatus.REVISING,
];

/** 状态色点的文字色（点本身用 bg-current）：筛选行的状态选项用，与状态药丸同一套语义色 */
export const TAILORING_STATUS_TONE: Record<EReviewTailoringStatus, string> = {
  [EReviewTailoringStatus.DRAFT]: "text-placeholder",
  [EReviewTailoringStatus.PENDING]: "text-warning-primary",
  [EReviewTailoringStatus.APPROVED]: "text-success-primary",
  [EReviewTailoringStatus.REVISING]: "text-accent-primary",
};
