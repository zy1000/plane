import { useTranslation } from "@plane/i18n";
import { EReviewTailoringKind } from "@plane/types";
import { cn } from "@plane/utils";

/**
 * 裁剪类型药丸。O 阶段那档用琥珀色，与模板库里 O 系列节点的 `StageReviewKindBadge` 同一套；
 * 过程评审用主色，和「修订中」状态同色但语义不同，靠文案区分。
 */
const KIND_PILL: Record<EReviewTailoringKind, string> = {
  [EReviewTailoringKind.PROCESS]: "bg-accent-subtle text-accent-primary",
  [EReviewTailoringKind.O_STAGE]: "bg-warning-subtle text-warning-primary",
};

export const ReviewTailoringKindBadge = ({
  kind,
  stageLabel,
  className,
}: {
  kind: EReviewTailoringKind;
  /** O 表绑定的阶段名，接在类型后面 */
  stageLabel?: string | null;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-11 font-medium whitespace-nowrap",
        KIND_PILL[kind],
        className
      )}
    >
      {t(`review_tailoring.kind.${kind}`)}
      {stageLabel && (
        <span className="ml-2 max-w-40 truncate border-l border-current/30 pl-2 font-semibold">{stageLabel}</span>
      )}
    </span>
  );
};
