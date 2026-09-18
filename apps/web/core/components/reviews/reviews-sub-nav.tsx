"use client";

import { observer } from "mobx-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Scissors } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { useReviewTailoringPermissions, REVIEW_TAILORINGS_HEADER_COUNT_ID } from "@/components/review-tailorings";
import { useStageReviewPermissions, STAGE_REVIEWS_HEADER_COUNT_ID } from "@/components/stage-reviews";
import { isReviewsSubPageActive, reviewTailoringsPath, stageReviewsPath } from "./routes";

type TSubNavItem = {
  key: string;
  i18nKey: string;
  icon: LucideIcon;
  href: string;
  /** 数量徽章挂点：由各自的列表组件 portal 进来，所以只有当前子页有数字 */
  countSlotId: string;
  canView: boolean;
};

type TReviewsSubNavProps = {
  workspaceSlug: string;
  projectId: string;
};

/**
 * 「评审」标签下的子页页签（阶段评审 / 裁剪）。
 *
 * 两个子页的列表页头都用它替代原来的面包屑 —— 项目名已经在顶部标签栏里，
 * 页头这一行留给子页切换。详情页不用它，走面包屑。
 */
export const ReviewsSubNav = observer(function ReviewsSubNav(props: TReviewsSubNavProps) {
  const { workspaceSlug, projectId } = props;
  const pathname = usePathname() ?? "";
  const { t } = useTranslation();
  const { canView: canViewStageReviews } = useStageReviewPermissions(workspaceSlug, projectId);
  const { canView: canViewTailorings } = useReviewTailoringPermissions(workspaceSlug, projectId);

  const items: TSubNavItem[] = [
    {
      key: "stage_reviews",
      i18nKey: "reviews.stage_reviews",
      icon: ClipboardCheck,
      href: stageReviewsPath(workspaceSlug, projectId),
      countSlotId: STAGE_REVIEWS_HEADER_COUNT_ID,
      canView: canViewStageReviews,
    },
    {
      key: "tailorings",
      i18nKey: "reviews.tailorings",
      icon: Scissors,
      href: reviewTailoringsPath(workspaceSlug, projectId),
      countSlotId: REVIEW_TAILORINGS_HEADER_COUNT_ID,
      canView: canViewTailorings,
    },
  ];

  const visibleItems = items.filter((item) => item.canView);
  if (visibleItems.length === 0) return null;

  return (
    <nav className="flex h-11 items-center">
      {visibleItems.map((item) => {
        const isActive = isReviewsSubPageActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "relative flex h-full items-center gap-2 px-3 text-13 whitespace-nowrap transition-colors",
              isActive ? "font-semibold text-accent-primary" : "text-secondary hover:text-primary"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{t(item.i18nKey)}</span>
            <div id={item.countSlotId} className="flex items-center" />
            {isActive && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-sm bg-accent-primary" aria-hidden />
            )}
          </Link>
        );
      })}
    </nav>
  );
});
