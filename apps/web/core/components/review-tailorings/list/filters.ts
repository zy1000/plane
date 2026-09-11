import type { IUserLite, TReviewTailoring } from "@plane/types";
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

/** 状态色点的文字色（点本身用 bg-current）：过滤面板与已应用条件条共用，与状态药丸同一套语义色 */
export const TAILORING_STATUS_TONE: Record<EReviewTailoringStatus, string> = {
  [EReviewTailoringStatus.DRAFT]: "text-placeholder",
  [EReviewTailoringStatus.PENDING]: "text-warning-primary",
  [EReviewTailoringStatus.APPROVED]: "text-success-primary",
  [EReviewTailoringStatus.REVISING]: "text-accent-primary",
};

export type TTailoringListFilters = {
  status: EReviewTailoringStatus[];
  createdBy: string[];
};

export const EMPTY_TAILORING_FILTERS: TTailoringListFilters = { status: [], createdBy: [] };

export const hasTailoringFilters = (filters: TTailoringListFilters) =>
  filters.status.length > 0 || filters.createdBy.length > 0;

export const toggleValue = <T>(values: T[], value: T): T[] =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

/**
 * 搜索与过滤都在前端做：一个项目的裁剪表是几张到几十张的量级，
 * 过滤面板里的计数也要基于全量，走服务端反而得多查一次。
 */
export const filterTailorings = (list: TReviewTailoring[], search: string, filters: TTailoringListFilters) => {
  const keyword = search.trim().toLowerCase();
  return list.filter((item) => {
    if (keyword && !item.title.toLowerCase().includes(keyword)) return false;
    if (filters.status.length > 0 && !filters.status.includes(item.status)) return false;
    if (filters.createdBy.length > 0 && !filters.createdBy.includes(item.created_by_detail?.id ?? "")) return false;
    return true;
  });
};

export type TCreatorOption = { user: IUserLite; count: number };

/** 创建人选项只来自列表本身：列出没建过表的成员只会让人筛出空表 */
export const buildCreatorOptions = (list: TReviewTailoring[]): TCreatorOption[] => {
  const byId = new Map<string, TCreatorOption>();
  for (const item of list) {
    const user = item.created_by_detail;
    if (!user) continue;
    const existing = byId.get(user.id);
    if (existing) existing.count += 1;
    else byId.set(user.id, { user, count: 1 });
  }
  return [...byId.values()].sort((a, b) => b.count - a.count);
};

export const countByStatus = (list: TReviewTailoring[]) => {
  const counts = Object.fromEntries(TAILORING_STATUS_ORDER.map((status) => [status, 0])) as Record<
    EReviewTailoringStatus,
    number
  >;
  for (const item of list) counts[item.status] += 1;
  return counts;
};
