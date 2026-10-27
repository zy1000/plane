import { useTranslation } from "@plane/i18n";
import type { ERiskStrategy, TRiskScale } from "@plane/types";
import { ERiskLevel, RISK_SCALES, RISK_STRATEGIES, computeRiskLevel } from "@plane/types";
import { cn } from "@plane/utils";
import type { TRiskScaleField } from "../constants";
import {
  RISK_I18N,
  RISK_LEVEL_STYLE,
  riskLevelLabelKey,
  riskProbabilityRangeKey,
  riskScaleLabelKey,
  riskStrategyLabelKey,
} from "../constants";
import type { TRiskFormValue } from "../form/risk-form-state";
import { AutoGrowTextArea } from "../form/risk-text-area-field";
import type { TRiskEditSession } from "./use-risk-edit-session";
import { EDIT_BOX_CLASS, MISSING_CLASS, RiskEditSelect, RiskFieldRow, RiskViewText } from "./risk-detail-fields";

/** 等级按低 → 高排，和五档的 1 → 5 同向 */
const LEVEL_ORDER: ERiskLevel[] = [ERiskLevel.LOW, ERiskLevel.MEDIUM, ERiskLevel.HIGH];

/** 编辑态下拉统一 280px 宽（等级旁还要放来源标签） */
const SELECT_WIDTH_CLASS = "w-70 max-w-full";

type TTextKey = "description" | "impactDescription" | "responseMeasures" | "riskLoss" | "triggerFactors";

/** 五档的一项：「3-中」，发生概率后面带淡色区间「31-50%」 */
const ScaleLabel = ({ field, scale }: { field: TRiskScaleField; scale: TRiskScale }) => {
  const { t } = useTranslation();
  return (
    <>
      {t(riskScaleLabelKey(scale))}
      {field === "probability" && <span className="ml-2 text-tertiary">{t(riskProbabilityRangeKey(scale))}</span>}
    </>
  );
};

/** 等级：圆点 + 文字（颜色只在圆点上，同右栏的状态） */
const LevelLabel = ({ level }: { level: ERiskLevel }) => {
  const { t } = useTranslation();
  return (
    <>
      <span className={cn("size-1.75 shrink-0 rounded-full", RISK_LEVEL_STYLE[level].square)} />
      {t(riskLevelLabelKey(level))}
    </>
  );
};

/**
 * 详情正文，左标签、右值，顺序同新建弹窗左栏：风险描述 → 影响程度 → 发生概率 → 风险等级 → 影响描述
 * → 应对措施 → 风险损失 → 触发因素 → 风险管理策略。附件 / 关联缺陷 / 活动由 risk-detail-root 接在后面。
 *
 * 查看时全是纯文本（空着写「未填写」）；点顶栏「编辑」后换成带边框的输入框 / 下拉，改动进草稿，「保存」一次提交。
 * 改影响程度 / 发生概率会按两项重新推算等级（覆盖手动值）；等级也能单独改，与推算值不同即「手动调整」。
 */
export const RiskContent = ({ session }: { session: TRiskEditSession }) => {
  const { t } = useTranslation();
  const { value, isEditing, patch, isMissing } = session;
  if (!value) return null;

  const computedLevel = computeRiskLevel(value.impactLevel, value.probability);
  const isManualLevel = Boolean(computedLevel && value.riskLevel && value.riskLevel !== computedLevel);

  const changeScale = (next: { impactLevel: TRiskScale } | { probability: TRiskScale }) => {
    const impact = "impactLevel" in next ? next.impactLevel : value.impactLevel;
    const probability = "probability" in next ? next.probability : value.probability;
    patch({ ...next, riskLevel: computeRiskLevel(impact, probability) ?? value.riskLevel });
  };

  const textRow = (key: TTextKey, label: string, options: { multiline?: boolean; required?: boolean } = {}) => (
    <RiskFieldRow label={label} required={options.required} isEditing={isEditing}>
      {!isEditing ? (
        <RiskViewText>{value[key]}</RiskViewText>
      ) : options.multiline ? (
        <AutoGrowTextArea
          value={value[key]}
          aria-label={label}
          onChange={(event) => patch({ [key]: event.target.value } as Partial<TRiskFormValue>)}
          className={cn(
            EDIT_BOX_CLASS,
            "-mx-2.5 max-h-[480px] min-h-14 w-[calc(100%+1.25rem)] overflow-y-auto px-2.5 py-[5px] leading-[22px]",
            options.required && isMissing("description") && MISSING_CLASS
          )}
        />
      ) : (
        <input
          value={value[key]}
          maxLength={255}
          aria-label={label}
          onChange={(event) => patch({ [key]: event.target.value } as Partial<TRiskFormValue>)}
          className={cn(EDIT_BOX_CLASS, "-mx-2.5 h-8 w-[calc(100%+1.25rem)] px-2.5")}
        />
      )}
    </RiskFieldRow>
  );

  const scaleRow = (field: TRiskScaleField) => {
    const current = field === "impact_level" ? value.impactLevel : value.probability;
    const missing = isMissing(field);
    return (
      <RiskFieldRow label={t(`${RISK_I18N}.fields.${field}`)} required isEditing={isEditing}>
        {isEditing ? (
          <RiskEditSelect<TRiskScale>
            value={current}
            options={RISK_SCALES.map((scale) => ({ value: scale, label: <ScaleLabel field={field} scale={scale} /> }))}
            missing={missing}
            className={cn("-ml-2.5", SELECT_WIDTH_CLASS)}
            onChange={(next) => {
              if (!next) return;
              changeScale(field === "impact_level" ? { impactLevel: next } : { probability: next });
            }}
          />
        ) : (
          <RiskViewText>{current ? <ScaleLabel field={field} scale={current} /> : null}</RiskViewText>
        )}
      </RiskFieldRow>
    );
  };

  const sourceTag = computedLevel && value.riskLevel && (
    <span className="shrink-0 text-12 text-tertiary">
      {t(`${RISK_I18N}.fields.${isManualLevel ? "risk_level_manual" : "risk_level_auto"}`)}
    </span>
  );

  return (
    <div className={cn("flex flex-col", isEditing ? "gap-2.5" : "gap-1.5")}>
      {textRow("description", t(`${RISK_I18N}.detail.description`), { multiline: true, required: true })}
      {scaleRow("impact_level")}
      {scaleRow("probability")}

      <RiskFieldRow label={t(`${RISK_I18N}.fields.risk_level`)} isEditing={isEditing}>
        {isEditing ? (
          <div className="flex items-center gap-3">
            <RiskEditSelect<ERiskLevel>
              value={value.riskLevel}
              options={LEVEL_ORDER.map((level) => ({ value: level, label: <LevelLabel level={level} /> }))}
              className={cn("-ml-2.5", SELECT_WIDTH_CLASS)}
              onChange={(next) => next && patch({ riskLevel: next })}
            />
            {sourceTag}
          </div>
        ) : value.riskLevel ? (
          <div className="flex min-h-8 items-center gap-2 text-14 text-primary">
            <LevelLabel level={value.riskLevel} />
            <span className="ml-1">{sourceTag}</span>
          </div>
        ) : (
          <RiskViewText className="text-placeholder">{t(`${RISK_I18N}.fields.risk_level_unset`)}</RiskViewText>
        )}
      </RiskFieldRow>

      {textRow("impactDescription", t(`${RISK_I18N}.detail.impact_description`), { multiline: true })}
      {textRow("responseMeasures", t(`${RISK_I18N}.detail.response_measures`), { multiline: true })}
      {textRow("riskLoss", t(`${RISK_I18N}.fields.risk_loss`))}
      {textRow("triggerFactors", t(`${RISK_I18N}.fields.trigger_factors`))}

      <RiskFieldRow label={t(`${RISK_I18N}.fields.strategy`)} isEditing={isEditing}>
        {isEditing ? (
          <RiskEditSelect<ERiskStrategy>
            value={value.strategy}
            options={RISK_STRATEGIES.map((strategy) => ({ value: strategy, label: t(riskStrategyLabelKey(strategy)) }))}
            clearable
            className={cn("-ml-2.5", SELECT_WIDTH_CLASS)}
            onChange={(next) => patch({ strategy: next })}
          />
        ) : (
          <RiskViewText>{value.strategy ? t(riskStrategyLabelKey(value.strategy)) : null}</RiskViewText>
        )}
      </RiskFieldRow>
    </div>
  );
};
