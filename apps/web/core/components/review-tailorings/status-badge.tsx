import { useTranslation } from "@plane/i18n";
import { EReviewTailoringStatus } from "@plane/types";
import { cn } from "@plane/utils";

/** 配色对齐需求变更单的状态药丸（products/requirements/change/styles.ts），全走语义 token */
const STATUS_PILL: Record<EReviewTailoringStatus, string> = {
  [EReviewTailoringStatus.DRAFT]: "bg-layer-2 text-tertiary",
  [EReviewTailoringStatus.PENDING]: "bg-warning-subtle text-warning-primary",
  [EReviewTailoringStatus.APPROVED]: "bg-success-subtle text-success-primary",
  [EReviewTailoringStatus.REVISING]: "bg-accent-subtle text-accent-primary",
};

export const ReviewTailoringStatusBadge = ({
  status,
  className,
}: {
  status: EReviewTailoringStatus;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-11 font-medium whitespace-nowrap",
        STATUS_PILL[status],
        className
      )}
    >
      {t(`review_tailoring.status.${status}`)}
    </span>
  );
};
