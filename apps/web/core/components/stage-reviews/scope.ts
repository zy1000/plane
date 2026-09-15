/**
 * 阶段评审列表的作用域。
 *
 * - `project`：项目的「阶段评审」页，只看这个项目的评审，「产品」是列 / 分组维。
 * - `product`：产品的「阶段评审」tab，汇总关联项目里这个产品的评审，「项目」是列 / 分组维；
 *   左栏标出产品当前所在阶段（`currentStageId` 来自产品档案的「产品阶段」）。
 *
 * 抽屉里的一切写操作始终落在**评审自己的项目**上，与作用域无关。
 */
export type TStageReviewScope =
  | { kind: "project"; projectId: string }
  | { kind: "product"; productId: string; currentStageId: string | null };

export type TStageReviewScopeKind = TStageReviewScope["kind"];

export const getStageReviewScopeId = (scope: TStageReviewScope) =>
  scope.kind === "project" ? scope.projectId : scope.productId;

/**
 * 本地存储（显示设置 / 筛选条件）用的键段。项目侧保持原来的裸 projectId，老用户的设置不丢；
 * 产品侧加前缀，避免与项目 id 撞在同一个命名空间。
 */
export const getStageReviewStorageScope = (scope: TStageReviewScope) =>
  scope.kind === "project" ? scope.projectId : `product:${scope.productId}`;

/** 作用域自己就是那一维时，这一维没有意义：项目页不出「项目」，产品页不出「产品」 */
export const STAGE_REVIEW_SCOPE_HIDDEN_DIMENSION: Record<TStageReviewScopeKind, "project" | "product"> = {
  project: "project",
  product: "product",
};
