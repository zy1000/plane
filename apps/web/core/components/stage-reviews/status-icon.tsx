import { EStageReviewStatus } from "@plane/types";
import { cn } from "@plane/utils";

/**
 * 状态图标。四个状态是一条线上的四步，图形跟着「填满多少」走：
 * 虚线圈（未评审）→ 半圈（评审中）→ 四分之三圈（审核中）→ 实心勾（已评审），颜色同状态药丸。
 */
export const StageReviewStatusIcon = ({ status, className }: { status: EStageReviewStatus; className?: string }) => {
  switch (status) {
    case EStageReviewStatus.IN_REVIEW:
      return (
        <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0 text-warning-primary", className)} aria-hidden>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 3.6a4.4 4.4 0 0 1 0 8.8z" fill="currentColor" />
        </svg>
      );
    case EStageReviewStatus.IN_APPROVAL:
      return (
        <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0 text-accent-primary", className)} aria-hidden>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 3.6a4.4 4.4 0 1 1-4.4 4.4H8z" fill="currentColor" />
        </svg>
      );
    case EStageReviewStatus.COMPLETED:
      return (
        <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0 text-success-primary", className)} aria-hidden>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="m4.8 8.2 2.1 2.1 4.3-4.4"
            fill="none"
            stroke="#fff"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0 text-placeholder", className)} aria-hidden>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2" />
        </svg>
      );
  }
};

/** 分段进度条 / 图例圆点共用的底色，顺序即「离完成还有多远」 */
export const STAGE_REVIEW_STATUS_FILL: Record<EStageReviewStatus, string> = {
  [EStageReviewStatus.NOT_STARTED]: "bg-layer-3",
  [EStageReviewStatus.IN_REVIEW]: "bg-warning-primary",
  [EStageReviewStatus.IN_APPROVAL]: "bg-accent-primary",
  [EStageReviewStatus.COMPLETED]: "bg-success-primary",
};
