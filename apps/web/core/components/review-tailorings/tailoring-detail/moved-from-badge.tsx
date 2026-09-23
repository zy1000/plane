import { ArrowLeftRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";

/** 「⇄ 自 O-F1」：评审活动是从别的阶段挪过来的。矩阵的行与明细的阶段列共用 */
export const MovedFromBadge = ({ stage }: { stage: string }) => {
  const { t } = useTranslation();
  return (
    <Tooltip tooltipContent={t("review_tailoring.move_stage.moved_from_tooltip", { stage })}>
      <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-accent-subtle pr-1.5 pl-1 text-11 font-medium whitespace-nowrap text-accent-primary">
        <ArrowLeftRight className="size-3" />
        {t("review_tailoring.move_stage.moved_from", { stage })}
      </span>
    </Tooltip>
  );
};
