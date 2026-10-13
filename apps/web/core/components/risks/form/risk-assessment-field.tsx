import type { ReactNode } from "react";
import { useTranslation } from "@plane/i18n";
import type { TRiskScale } from "@plane/types";
import { ERiskLevel, RISK_SCALES, computeRiskLevel } from "@plane/types";
import { cn } from "@plane/utils";
import { ModalInlineError } from "@/components/common/form-modal";
import { RiskLevelSourceTag } from "../badges";
import type { TRiskScaleField } from "../constants";
import { RISK_I18N, RISK_LEVEL_STYLE, riskLevelLabelKey, riskProbabilityRangeKey, riskScaleLabelKey } from "../constants";

/** 等级按低 → 高排，和五档的 1 → 5 同向 */
const LEVEL_ORDER: ERiskLevel[] = [ERiskLevel.LOW, ERiskLevel.MEDIUM, ERiskLevel.HIGH];

/** 选中档：浅底 + 同色字 + 深一档的边框 */
const LEVEL_SELECTED_CLASS: Record<ERiskLevel, string> = {
  high: "border-danger-strong bg-danger-subtle text-danger-primary",
  medium: "border-warning-strong bg-warning-subtle text-warning-primary",
  low: "border-success-strong bg-success-subtle text-success-primary",
};

/** 卡片里的一行：字段名固定 92px，值在右 */
const AssessmentRow = ({
  label,
  required = false,
  hasError = false,
  children,
}: {
  label: string;
  required?: boolean;
  hasError?: boolean;
  children: ReactNode;
}) => (
  <div className="grid grid-cols-[92px_minmax(0,1fr)] items-start">
    <span
      className={cn(
        "flex h-9.5 items-center text-13 font-medium whitespace-nowrap",
        hasError ? "text-danger-primary" : "text-secondary"
      )}
    >
      {label}
      {required && <span className="ml-0.5 text-danger-primary">*</span>}
    </span>
    <div className="min-w-0">{children}</div>
  </div>
);

/** 一排五档：影响程度「1-很低」…，发生概率「1-很低(<10%)」…（区间淡色）；选中档主色填满 */
const ScaleSelector = ({
  field,
  label,
  value,
  hasError,
  disabled,
  onChange,
}: {
  field: TRiskScaleField;
  label: string;
  value: TRiskScale | null;
  hasError: boolean;
  disabled: boolean;
  onChange: (next: TRiskScale) => void;
}) => {
  const { t } = useTranslation();
  const isProbability = field === "probability";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "grid grid-cols-5 gap-0.75 rounded-[10px] border bg-layer-3 p-0.75",
        // 发生概率带区间，卡片窄（抽屉）时区间换到第二行，够宽（整页 / 弹窗）才一行
        isProbability ? "h-13 @[42rem]/assess:h-9.5" : "h-9.5",
        hasError ? "border-danger-strong" : "border-transparent"
      )}
    >
      {RISK_SCALES.map((scale) => {
        const isSelected = value === scale;
        return (
          <button
            key={scale}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(scale)}
            className={cn(
              "flex min-w-0 items-center justify-center rounded-[7px] px-1 text-13 whitespace-nowrap tabular-nums transition-colors disabled:cursor-default",
              isProbability && "flex-col leading-tight @[42rem]/assess:flex-row @[42rem]/assess:leading-normal",
              isSelected
                ? "bg-accent-primary font-semibold text-on-color shadow-raised-100"
                : "text-secondary enabled:hover:bg-layer-1-hover"
            )}
          >
            {t(riskScaleLabelKey(scale))}
            {isProbability && (
              <span className={cn("text-12 font-normal", isSelected ? "text-on-color opacity-80" : "text-placeholder")}>
                ({t(riskProbabilityRangeKey(scale))})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/** 低 / 中 / 高 三段：选中档用等级色 */
const LevelSelector = ({
  value,
  disabled,
  onChange,
}: {
  value: ERiskLevel | null;
  disabled: boolean;
  onChange: (next: ERiskLevel) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={t(`${RISK_I18N}.fields.risk_level`)}
      className="inline-grid h-9.5 shrink-0 grid-cols-[repeat(3,78px)] gap-0.75 rounded-[10px] bg-layer-3 p-0.75"
    >
      {LEVEL_ORDER.map((level) => {
        const isSelected = value === level;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(level)}
            className={cn(
              "flex items-center justify-center gap-1.75 rounded-[7px] border text-13 transition-colors disabled:cursor-default",
              isSelected
                ? cn("font-semibold", LEVEL_SELECTED_CLASS[level])
                : "border-transparent text-secondary enabled:hover:bg-layer-1-hover"
            )}
          >
            <span className={cn("size-2 shrink-0 rounded-[2px]", RISK_LEVEL_STYLE[level].square)} />
            {t(riskLevelLabelKey(level))}
          </button>
        );
      })}
    </div>
  );
};

/**
 * 风险评估：影响程度、发生概率、风险等级三行一张卡片。
 *
 * - 改影响程度 / 发生概率时，两项都有值就按 `computeRiskLevel` 推算等级，覆盖之前的手动值。
 * - 等级可以手动改，影响程度和发生概率不动；当前等级和推算值不同即「手动调整」，下面提示再改两项会重新推算。
 * - 新建 / 编辑弹窗和详情（整页 / 抽屉）共用；访客只读传 `disabled`。
 */
export const RiskAssessmentField = ({
  impactLevel,
  probability,
  riskLevel,
  error,
  disabled = false,
  onChange,
}: {
  impactLevel: TRiskScale | null;
  probability: TRiskScale | null;
  riskLevel: ERiskLevel | null;
  disabled?: boolean;
  /** 点过提交后两项还没选全：整块标红，卡片下方出红字 */
  error?: string;
  onChange: (next: { impactLevel?: TRiskScale; probability?: TRiskScale; riskLevel?: ERiskLevel }) => void;
}) => {
  const { t } = useTranslation();
  const hasError = Boolean(error);
  const computedLevel = computeRiskLevel(impactLevel, probability);
  const isManual = Boolean(computedLevel && riskLevel && riskLevel !== computedLevel);

  const changeScale = (next: { impactLevel: TRiskScale } | { probability: TRiskScale }) => {
    const nextImpact = "impactLevel" in next ? next.impactLevel : impactLevel;
    const nextProbability = "probability" in next ? next.probability : probability;
    if (nextImpact === impactLevel && nextProbability === probability) return;
    const nextLevel = computeRiskLevel(nextImpact, nextProbability);
    onChange(nextLevel ? { ...next, riskLevel: nextLevel } : next);
  };

  return (
    <div className="min-w-0">
      <div
        className={cn(
          "@container/assess flex flex-col gap-3 rounded-[14px] border bg-surface-2 py-4 pr-5 pl-4.5",
          hasError ? "border-danger-strong" : "border-subtle"
        )}
      >
        <AssessmentRow label={t(`${RISK_I18N}.fields.impact_level`)} required hasError={hasError && !impactLevel}>
          <ScaleSelector
            field="impact_level"
            label={t(`${RISK_I18N}.fields.impact_level`)}
            value={impactLevel}
            hasError={hasError && !impactLevel}
            disabled={disabled}
            onChange={(next) => changeScale({ impactLevel: next })}
          />
        </AssessmentRow>
        <AssessmentRow label={t(`${RISK_I18N}.fields.probability`)} required hasError={hasError && !probability}>
          <ScaleSelector
            field="probability"
            label={t(`${RISK_I18N}.fields.probability`)}
            value={probability}
            hasError={hasError && !probability}
            disabled={disabled}
            onChange={(next) => changeScale({ probability: next })}
          />
        </AssessmentRow>
        <div className="border-t border-dashed border-subtle-1" />
        <AssessmentRow label={t(`${RISK_I18N}.fields.risk_level`)}>
          <div className="flex min-h-9.5 flex-wrap items-center gap-3.5">
            <LevelSelector
              value={riskLevel}
              disabled={disabled}
              onChange={(next) => {
                if (next !== riskLevel) onChange({ riskLevel: next });
              }}
            />
            {computedLevel && riskLevel && <RiskLevelSourceTag manual={isManual} />}
          </div>
          {isManual && (
            <p className="mt-1.5 text-12 text-placeholder">{t(`${RISK_I18N}.fields.risk_level_manual_hint`)}</p>
          )}
        </AssessmentRow>
      </div>
      {error && <ModalInlineError message={error} />}
    </div>
  );
};
