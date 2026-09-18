/**
 * 「评审」标签下两个子页（阶段评审 / 裁剪）的路径与选中判定。
 *
 * 裁剪表和阶段评审原先是两个并列的项目标签（/review-tailorings、/stage-reviews），
 * 合并成一个「评审」标签后统一挂在 /reviews 下，由页头的子页页签切换。
 * 路径集中在这里：列表、详情、通知卡、空态都从这里取，别再手写字符串。
 */

export const reviewsBasePath = (workspaceSlug: string, projectId: string) =>
  `/${workspaceSlug}/projects/${projectId}/reviews`;

export const stageReviewsPath = (workspaceSlug: string, projectId: string) =>
  `${reviewsBasePath(workspaceSlug, projectId)}/stage-reviews`;

export const stageReviewDetailPath = (workspaceSlug: string, projectId: string, reviewId: string) =>
  `${stageReviewsPath(workspaceSlug, projectId)}/${reviewId}`;

export const reviewTailoringsPath = (workspaceSlug: string, projectId: string) =>
  `${reviewsBasePath(workspaceSlug, projectId)}/tailorings`;

export const reviewTailoringDetailPath = (workspaceSlug: string, projectId: string, tailoringId: string) =>
  `${reviewTailoringsPath(workspaceSlug, projectId)}/${tailoringId}`;

const normalizePath = (path: string) => path.replace(/\/+$/, "");

/** 子页页签的选中判定：列表页和它的详情页都算同一个子页 */
export const isReviewsSubPageActive = (pathname: string, subPagePath: string) => {
  const current = normalizePath(pathname);
  const base = normalizePath(subPagePath);
  return current === base || current.startsWith(`${base}/`);
};
