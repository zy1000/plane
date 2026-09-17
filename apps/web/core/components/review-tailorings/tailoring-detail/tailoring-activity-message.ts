import type { TReviewTailoringActivity } from "@plane/types";

type TFn = (key: string, values?: Record<string, unknown>) => string;

/**
 * 把一条「修改」类活动翻成一句人话（状态推进与格子改动由时间线各自的行渲染）。
 *
 * 分派键是 `field`，与后端 `_write_activity` 的调用点一一对应；
 * 认不出来的落到 fallback，而不是渲染一行空白。
 */
export const buildActivityMessage = (activity: TReviewTailoringActivity, t: TFn): string => {
  const extra = (activity.extra ?? {}) as Record<string, unknown>;

  switch (activity.field) {
    case "title":
      return t("review_tailoring.activity.title_changed", {
        old: activity.old_value ?? "",
        new: activity.new_value ?? "",
      });
    case "description":
      return t("review_tailoring.activity.description_changed");
    // 加列与移除列共用 field="products"：加列记 new_value，移除列记 old_value
    case "products":
      return activity.new_value
        ? t("review_tailoring.activity.products_added", { count: activity.new_value })
        : t("review_tailoring.activity.products_removed");
    case "reviews":
      return activity.new_value
        ? t("review_tailoring.activity.reviews_added", { count: activity.new_value })
        : t("review_tailoring.activity.reviews_removed");
    case "items":
      return t("review_tailoring.activity.items_synced", {
        added: extra.added ?? 0,
        removed: extra.removed ?? 0,
      });
    case "comment":
      return t("review_tailoring.activity.comment");
    default:
      return t("review_tailoring.activity.fallback");
  }
};
