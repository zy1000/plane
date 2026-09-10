import { useTranslation } from "@plane/i18n";
import { EStageReviewKind } from "@plane/types";
import { cn } from "@plane/utils";

/**
 * 类型徽章。O 阶段的两个类型用琥珀色单独标出来 —— 只有那一支带成品、组件版本、
 * 生产方式、出货评估几组字段，和普通评审不是一回事。
 */
const KIND_CLASS: Record<EStageReviewKind, string> = {
  [EStageReviewKind.REVIEW]: "bg-accent-primary/12 text-accent-primary",
  [EStageReviewKind.ACTIVITY]: "bg-layer-1 text-tertiary",
  [EStageReviewKind.O_STAGE_REVIEW]: "border border-warning-subtle bg-warning-subtle text-warning-primary",
  [EStageReviewKind.O_STAGE_ACTIVITY]: "bg-warning-subtle/70 text-warning-primary",
};

export function StageReviewKindBadge({ kind }: { kind: EStageReviewKind }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center rounded px-1.5 text-11 font-medium whitespace-nowrap",
        KIND_CLASS[kind]
      )}
    >
      {t(`workspace_templates.reviews.kind.${kind}`)}
    </span>
  );
}
