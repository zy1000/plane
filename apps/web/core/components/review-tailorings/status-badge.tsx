import { useTranslation } from "@plane/i18n";
import { EReviewTailoringStatus } from "@plane/types";
import { cn } from "@plane/utils";

/** 配色对齐需求变更单的状态药丸（products/requirements/change/styles.ts），全走语义 token */
const STATUS_PILL: Record<EReviewTailoringStatus, string> = {
  [EReviewTailoringStatus.DRAFT]: "bg-layer-3 text-tertiary",
  [EReviewTailoringStatus.PENDING]: "bg-warning-subtle text-warning-primary",
  [EReviewTailoringStatus.APPROVED]: "bg-success-subtle text-success-primary",
  [EReviewTailoringStatus.REVISING]: "bg-accent-subtle text-accent-primary",
};

export const ReviewTailoringStatusBadge = ({
  status,
  showDot = false,
  className,
}: {
  status: EReviewTailoringStatus;
  /** 列表里药丸前带一个色点，详情页头部不带 */
  showDot?: boolean;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-11 font-medium whitespace-nowrap",
        STATUS_PILL[status],
        className
      )}
    >
      {showDot && <span className="size-1.5 shrink-0 rounded-full bg-current" />}
      {t(`review_tailoring.status.${status}`)}
    </span>
  );
};
