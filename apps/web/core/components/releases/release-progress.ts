type TReleaseProgressCounts = {
  total_issues?: number | null;
  completed_issues?: number | null;
  cancelled_issues?: number | null;
  total_requirements?: number | null;
  completed_requirements?: number | null;
  cancelled_requirements?: number | null;
};

/**
 * 发布完成度（0-100），与迭代 calculateCycleProgress 同口径：
 * 已完成工作项 + 已发布需求 ÷（工作项 − 已取消 + 需求 − 已关闭）。
 */
export const getReleaseProgress = (counts: TReleaseProgressCounts | null | undefined): number => {
  if (!counts) return 0;
  const completed = (counts.completed_issues ?? 0) + (counts.completed_requirements ?? 0);
  const total =
    (counts.total_issues ?? 0) -
    (counts.cancelled_issues ?? 0) +
    (counts.total_requirements ?? 0) -
    (counts.cancelled_requirements ?? 0);
  if (total <= 0) return 0;
  return Math.min(100, Math.floor((completed / total) * 100));
};
