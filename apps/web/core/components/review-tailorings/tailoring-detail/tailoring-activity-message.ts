import type { TReviewTailoringActivity } from "@plane/types";

type TFn = (key: string, values?: Record<string, unknown>) => string;

/**
 * 把一条活动翻成一句人话。
 *
 * 分派键是 `(field, verb)` 组合，与后端 `_write_activity` 的调用点一一对应；
 * 认不出来的落到 fallback，而不是渲染一行空白。
 */
export const buildActivityMessage = (activity: TReviewTailoringActivity, t: TFn): string => {
  const extra = (activity.extra ?? {}) as Record<string, unknown>;
  const title = String(extra.title ?? activity.new_value ?? "");

  switch (activity.field) {
    case "tailoring":
      return t("review_tailoring.activity.created", { title: activity.new_value ?? "" });
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
    case "cell_selected":
      return activity.new_value === "True" || activity.new_value === "true"
        ? t("review_tailoring.activity.cell_selected_on", { title })
        : t("review_tailoring.activity.cell_selected_off", { title });
    case "cell_reason":
      return t("review_tailoring.activity.cell_reason", { title });
    case "comment":
      return t("review_tailoring.activity.comment");
    case "approval":
      return t("review_tailoring.activity.approved_partial", { value: activity.new_value ?? "" });
    case "status":
      switch (activity.verb) {
        case "submitted":
          return t("review_tailoring.activity.submitted", { round: extra.round ?? 1 });
        case "approved":
          return t("review_tailoring.activity.applied", {
            created: extra.created_count ?? 0,
            deleted: extra.deleted_count ?? 0,
          });
        case "rejected":
          return t("review_tailoring.activity.rejected");
        case "withdrawn":
          return t("review_tailoring.activity.withdrawn");
        case "revising":
          return t("review_tailoring.activity.revising");
        case "revision_cancelled":
          return t("review_tailoring.activity.revision_cancelled");
        default:
          return t("review_tailoring.activity.fallback");
      }
    default:
      return t("review_tailoring.activity.fallback");
  }
};
