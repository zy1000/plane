import { useTranslation } from "@plane/i18n";
import type { EReviewTailoringStatus } from "@plane/types";
import { cn } from "@plane/utils";
import { TAILORING_STATUS_TONE } from "./list/filters";

/** 状态：一个色点 + 文字，不铺底色。列表、详情属性行、签批弹窗共用 */
export const ReviewTailoringStatusText = ({
  status,
  className,
}: {
  status: EReviewTailoringStatus;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full bg-current", TAILORING_STATUS_TONE[status])} />
      {t(`review_tailoring.status.${status}`)}
    </span>
  );
};
