import type { TStageReview, TStageReviewProduct } from "@plane/types";
import { EStageReviewStatus } from "@plane/types";

/** 表格里的一行：评审或评审活动，`depth=1` 的缩进挂在所属评审下 */
export type TStageReviewRow = {
  review: TStageReview;
  depth: 0 | 1;
};

export type TStageReviewGroup = {
  product: TStageReviewProduct;
  rows: TStageReviewRow[];
  total: number;
  completed: number;
};

export type TStageReviewFilters = {
  productId: string | null;
  status: EStageReviewStatus | null;
  leaderId: string | null;
  /** 只看与我有关：我是负责人或审核者 */
  mineOnly: boolean;
};

export const EMPTY_STAGE_REVIEW_FILTERS: TStageReviewFilters = {
  productId: null,
  status: null,
  leaderId: null,
  mineOnly: false,
};

const matches = (review: TStageReview, filters: TStageReviewFilters, currentUserId: string | undefined) => {
  if (filters.productId && review.product_id !== filters.productId) return false;
  if (filters.status && review.status !== filters.status) return false;
  if (filters.leaderId && review.leader_id !== filters.leaderId) return false;
  if (filters.mineOnly && currentUserId) {
    if (review.leader_id !== currentUserId && review.auditor_id !== currentUserId) return false;
  }
  return true;
};

/**
 * 扁平的评审列表折成「产品分组 + 两层树」。
 *
 * 两条规则值得记住：
 * 1. **筛选命中子活动时，它所属的评审要跟着留下来** —— 否则一条活动会孤零零地顶在
 *    分组下，读不出它属于哪个评审。父只是被带出来的话不参与计数。
 * 2. 评审活动允许没有父（有些阶段没有汇总评审），那种就按顶层行渲染。
 *
 * 分组头的「x / y 已评审」按**筛选后**的行算 —— 屏幕上看到几条，这个数就说几条。
 */
export const buildStageReviewGroups = (
  reviews: TStageReview[],
  filters: TStageReviewFilters,
  currentUserId: string | undefined
): TStageReviewGroup[] => {
  const hits = new Set(reviews.filter((review) => matches(review, filters, currentUserId)).map((review) => review.id));
  const byId = new Map(reviews.map((review) => [review.id, review]));
  // 命中的活动把它所属的评审一起带出来
  const visible = new Set(hits);
  for (const id of hits) {
    const parentId = byId.get(id)?.parent_id;
    if (parentId) visible.add(parentId);
  }

  const groups = new Map<string, TStageReviewGroup>();
  const childrenOf = new Map<string, TStageReview[]>();

  for (const review of reviews) {
    if (!visible.has(review.id)) continue;
    if (review.parent_id) {
      const siblings = childrenOf.get(review.parent_id) ?? [];
      siblings.push(review);
      childrenOf.set(review.parent_id, siblings);
    }
  }

  for (const review of reviews) {
    if (!visible.has(review.id) || review.parent_id) continue;
    const product = review.product_detail ?? {
      id: review.product_id,
      name: "—",
      code: "",
      identifier: "",
    };
    const group = groups.get(product.id) ?? { product, rows: [], total: 0, completed: 0 };
    group.rows.push({ review, depth: 0 });
    for (const child of childrenOf.get(review.id) ?? []) {
      group.rows.push({ review: child, depth: 1 });
    }
    groups.set(product.id, group);
  }

  for (const group of groups.values()) {
    // 只被「带出来」的父不算进进度，否则筛完的分组头会多出没命中的那条
    const counted = group.rows.filter((row) => hits.has(row.review.id));
    group.total = counted.length;
    group.completed = counted.filter((row) => row.review.status === EStageReviewStatus.COMPLETED).length;
  }

  return [...groups.values()].sort((a, b) => a.product.name.localeCompare(b.product.name));
};

/** 顶部四张卡：按当前阶段的全部评审算，不受筛选影响 */
export const countByStatus = (reviews: TStageReview[]): Record<EStageReviewStatus, number> => {
  const counts = {
    [EStageReviewStatus.NOT_STARTED]: 0,
    [EStageReviewStatus.IN_REVIEW]: 0,
    [EStageReviewStatus.IN_APPROVAL]: 0,
    [EStageReviewStatus.COMPLETED]: 0,
  };
  for (const review of reviews) counts[review.status] += 1;
  return counts;
};
