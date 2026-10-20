import { useTranslation } from "@plane/i18n";
import type { ERiskLevel, ERiskStatus } from "@plane/types";
import { cn } from "@plane/utils";
import { RISK_I18N, RISK_LEVEL_STYLE, RISK_STATUS_STYLE, riskLevelLabelKey, riskStatusLabelKey } from "./constants";

/** 状态：圆点 + 底色药丸。列表、抽屉顶栏、关联区块共用 */
export const RiskStatusBadge = ({ status, className }: { status: ERiskStatus; className?: string }) => {
  const { t } = useTranslation();
  const style = RISK_STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-md px-2 text-12 font-medium whitespace-nowrap",
        style.pill,
        className
      )}
    >
      <span className={cn("size-1.75 shrink-0 rounded-full", style.dot)} />
      {t(riskStatusLabelKey(status))}
    </span>
  );
};

/** 等级：方点 + 色字，不带底色 —— 与状态分两种画法，扫表时不混。空（简道云同步来的没评估）显「未评估」 */
export const RiskLevelBadge = ({ level, className }: { level: ERiskLevel | ""; className?: string }) => {
  const { t } = useTranslation();
  if (!level) {
    return (
      <span className={cn("inline-flex shrink-0 items-center text-13 whitespace-nowrap text-placeholder", className)}>
        {t(`${RISK_I18N}.fields.risk_level_unset`)}
      </span>
    );
  }
  const style = RISK_LEVEL_STYLE[level];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-13 font-semibold whitespace-nowrap", style.text, className)}>
      <span className={cn("size-2 shrink-0 rounded-[2px]", style.square)} />
      {t(riskLevelLabelKey(level))}
    </span>
  );
};

/** 等级旁的小标签：与影响程度 × 发生概率的推算值一致是「自动推算」，不一致是「手动调整」 */
export const RiskLevelSourceTag = ({ manual, className }: { manual: boolean; className?: string }) => {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center rounded-md px-1.75 text-12 font-medium whitespace-nowrap",
        manual ? "bg-accent-subtle text-accent-primary" : "bg-layer-3 text-tertiary",
        className
      )}
    >
      {t(`${RISK_I18N}.fields.${manual ? "risk_level_manual" : "risk_level_auto"}`)}
    </span>
  );
};
