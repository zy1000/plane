import { useTranslation } from "@plane/i18n";
import type { ERiskStrategy } from "@plane/types";
import { RISK_STRATEGIES } from "@plane/types";
import { cn } from "@plane/utils";
import { RISK_I18N, riskStrategyLabelKey } from "../constants";

/**
 * 风险管理策略：规避 / 转移 / 减轻 / 接受 四段，选中档主色填满；选填，再点一次已选的那段就取消。
 * 新建 / 编辑弹窗和详情正文共用。
 */
export const RiskStrategySegmented = ({
  value,
  disabled = false,
  onChange,
}: {
  value: ERiskStrategy | "";
  disabled?: boolean;
  onChange: (next: ERiskStrategy | "") => void;
}) => {
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={t(`${RISK_I18N}.fields.strategy`)}
      className="grid h-9.5 w-full max-w-[460px] grid-cols-4 gap-0.75 rounded-[10px] bg-layer-3 p-0.75"
    >
      {RISK_STRATEGIES.map((strategy) => {
        const isSelected = value === strategy;
        return (
          <button
            key={strategy}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(isSelected ? "" : strategy)}
            className={cn(
              "rounded-[7px] text-13 whitespace-nowrap transition-colors disabled:cursor-default",
              isSelected
                ? "bg-accent-primary font-semibold text-on-color shadow-raised-100"
                : "text-secondary enabled:hover:bg-layer-1-hover"
            )}
          >
            {t(riskStrategyLabelKey(strategy))}
          </button>
        );
      })}
    </div>
  );
};
