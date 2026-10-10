import { useTranslation } from "@plane/i18n";
import { EStageReviewKind } from "@plane/types";
import { cn } from "@plane/utils";

/**
 * 类型徽章。O 阶段的两个类型用琥珀色单独标出来 —— 只有那一支带成品、组件版本、
 * 生产方式、出货评估几组字段，和普通评审不是一回事。
 *
 * 一条规则：色系 = 体系（普通蓝、O 阶段琥珀），深浅 = 层级（评审深、评审活动浅）。四种同一个形状、都不带边框。
 * 琥珀底要用 warning-primary 叠透明度 —— warning-subtle（amber-100）在亮色下几乎是白的，铺上去看不出底色；
 * 琥珀本身比品牌蓝亮，同样的深浅要叠更高的透明度。
 */
const KIND_CLASS: Record<EStageReviewKind, string> = {
  [EStageReviewKind.REVIEW]: "bg-accent-primary/12 text-accent-primary",
  [EStageReviewKind.ACTIVITY]: "bg-accent-primary/6 text-accent-primary",
  [EStageReviewKind.O_STAGE_REVIEW]: "bg-warning-primary/24 text-warning-primary",
  [EStageReviewKind.O_STAGE_ACTIVITY]: "bg-warning-primary/12 text-warning-primary",
};

export function StageReviewKindBadge({ kind, className }: { kind: EStageReviewKind; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center rounded px-1.5 text-11 font-medium whitespace-nowrap",
        KIND_CLASS[kind],
        className
      )}
    >
      {t(`workspace_templates.reviews.kind.${kind}`)}
    </span>
  );
}
