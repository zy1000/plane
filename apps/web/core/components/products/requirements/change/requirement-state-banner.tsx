/** 页头内联状态说明，避免再为草稿 / 审批状态单独占用一整行。 */
import { Info } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirement } from "@plane/types";
import { cn } from "@plane/utils";

export function RequirementStateNotice({
  requirement,
  onViewChangeRequest,
}: {
  requirement: TRequirement;
  onViewChangeRequest: () => void;
}) {
  const { t } = useTranslation();
  const isInReview = requirement.status === "in_review";
  const isPublishedDraft = requirement.status === "draft" && requirement.current_version !== null;

  if (!isInReview && !isPublishedDraft) return null;

  const message = t(
    isInReview
      ? "workspace_products.requirements.state.in_review_banner"
      : "workspace_products.requirements.state.draft_notice"
  );
  return (
    <>
      <span className="sr-only">{message}</span>
      <Tooltip tooltipContent={message} position="bottom">
        <span
          aria-hidden
          className={cn(
            "hidden min-w-0 items-center gap-1.5 text-12 lg:flex",
            isInReview ? "text-accent-primary" : "text-warning-primary"
          )}
        >
          <Info className="size-3.5 shrink-0" aria-hidden />
          <span className="hidden max-w-72 truncate 2xl:inline">{message}</span>
        </span>
      </Tooltip>
      {isInReview && requirement.pending_change_request_id && (
        <button
          type="button"
          onClick={onViewChangeRequest}
          className="hidden shrink-0 text-12 font-medium text-accent-primary hover:underline lg:inline"
        >
          {t("workspace_products.requirements.state.view_change_request")}
        </button>
      )}
    </>
  );
}
