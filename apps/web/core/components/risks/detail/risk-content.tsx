import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import type { TRiskDetail, TUpdateRiskPayload } from "@plane/types";
import { cn } from "@plane/utils";
import { Block, EmptyLine } from "../../stage-reviews/detail/stage-review-content";
import { RISK_I18N } from "../constants";
import { RiskAssessmentField } from "../form/risk-assessment-field";
import { RiskStrategySegmented } from "../form/risk-strategy-segmented";
import { AutoGrowTextArea } from "../form/risk-text-area-field";

/**
 * 编辑区的外壳：平时没有框，悬停出一圈淡边，聚焦出蓝边 —— 与标题、右栏就地编辑格同一口径。
 */
const FIELD_BOX_CLASS =
  "-mx-2.5 rounded-lg border border-transparent px-2.5 py-1.5 transition hover:border-subtle focus-within:border-accent-strong";
const FIELD_LINE_CLASS =
  "min-h-7 [font-family:var(--font-style)] text-[length:var(--font-size-regular)] leading-[var(--line-height-regular)]";

type TTextField = "description" | "impact_description" | "response_measures";

/** 三段纯文本：风险描述必填，另两段可空；空且只读时整块不出 */
const DESCRIPTION_FIELD = {
  key: "description",
  labelKey: "description",
  placeholderKey: "form.editor_placeholder",
  required: true,
} as const;
const IMPACT_DESCRIPTION_FIELD = {
  key: "impact_description",
  labelKey: "impact_description",
  placeholderKey: "detail.impact_description_placeholder",
  required: false,
} as const;
const RESPONSE_MEASURES_FIELD = {
  key: "response_measures",
  labelKey: "response_measures",
  placeholderKey: "detail.response_measures_placeholder",
  required: false,
} as const;
type TTextFieldConfig = { key: TTextField; labelKey: string; placeholderKey: string; required: boolean };

/**
 * 详情正文，顺序同新建弹窗左栏：风险描述 → 评估（影响程度 / 发生概率 / 风险等级）→ 影响描述 → 应对措施
 * → 风险损失 → 触发因素 → 风险管理策略。附件 / 关联缺陷 / 活动由 risk-detail-root 接在后面。
 *
 * 全部就地编辑、改了直接保存：三段文本和单行文本失焦保存，评估卡片和策略点了就存。
 * 评估卡片与弹窗是同一个组件：改影响程度 / 发生概率只发这一项，后端重新推算等级；
 * 改等级只发 risk_level（手动调整）。访客只读。
 */
export const RiskContent = ({
  detail,
  editable,
  onUpdate,
}: {
  detail: TRiskDetail;
  editable: boolean;
  onUpdate: (payload: TUpdateRiskPayload) => void;
}) => {
  const { t } = useTranslation();
  const textProps = { detail, editable, onUpdate };
  return (
    <>
      <TextField field={DESCRIPTION_FIELD} {...textProps} />
      <RiskAssessmentField
        impactLevel={detail.impact_level}
        probability={detail.probability}
        riskLevel={detail.risk_level}
        disabled={!editable}
        onChange={(next) => {
          if (next.impactLevel !== undefined) onUpdate({ impact_level: next.impactLevel });
          else if (next.probability !== undefined) onUpdate({ probability: next.probability });
          else if (next.riskLevel) onUpdate({ risk_level: next.riskLevel });
        }}
      />
      <TextField field={IMPACT_DESCRIPTION_FIELD} {...textProps} />
      <TextField field={RESPONSE_MEASURES_FIELD} {...textProps} />
      <InlineTextField
        title={t(`${RISK_I18N}.fields.risk_loss`)}
        value={detail.risk_loss}
        placeholder={t(`${RISK_I18N}.detail.risk_loss_placeholder`)}
        editable={editable}
        onSave={(next) => onUpdate({ risk_loss: next })}
      />
      <InlineTextField
        title={t(`${RISK_I18N}.fields.trigger_factors`)}
        value={detail.trigger_factors}
        placeholder={t(`${RISK_I18N}.detail.trigger_factors_placeholder`)}
        editable={editable}
        onSave={(next) => onUpdate({ trigger_factors: next })}
      />
      <Block title={t(`${RISK_I18N}.fields.strategy`)}>
        <RiskStrategySegmented
          value={detail.strategy}
          disabled={!editable}
          onChange={(next) => onUpdate({ strategy: next })}
        />
      </Block>
    </>
  );
};

/**
 * 单行文本（风险损失 / 触发因素）：外壳同多行文本（平时无框、悬停淡边、聚焦蓝边），失焦保存，没改不发请求。
 * 空且只读时整块不出（同可空的两段文本）。
 */
const InlineTextField = ({
  title,
  value,
  placeholder,
  editable,
  onSave,
}: {
  title: string;
  value: string;
  placeholder: string;
  editable: boolean;
  onSave: (next: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (!editable) {
    if (!value) return null;
    return (
      <Block title={title}>
        <p className={cn(FIELD_LINE_CLASS, "break-words text-secondary")}>{value}</p>
      </Block>
    );
  }
  return (
    <Block title={title}>
      <input
        value={draft}
        maxLength={255}
        placeholder={placeholder}
        aria-label={title}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next !== value) onSave(next);
          else setDraft(value);
        }}
        className={cn(
          FIELD_BOX_CLASS,
          "w-[calc(100%+1.25rem)] bg-transparent text-14 text-primary outline-none placeholder:text-placeholder"
        )}
      />
    </Block>
  );
};

/**
 * 一段多行文本：随内容长高、超过上限在框里滚，失焦保存。描述是必填项，清空了不发请求、回滚到已保存的值。
 */
const TextField = ({
  field,
  detail,
  editable,
  onUpdate,
}: {
  field: TTextFieldConfig;
  detail: TRiskDetail;
  editable: boolean;
  onUpdate: (payload: TUpdateRiskPayload) => void;
}) => {
  const { t } = useTranslation();
  const saved = detail[field.key] ?? "";
  const [draft, setDraft] = useState(saved);

  /**
   * 换一条风险时整个重置；保存回来时只在手上没改过（草稿还等于上一次同步的值）才回灌 ——
   * 失焦发出第一版后又接着改，第一版的响应回来不能把第二版冲掉，否则下次失焦看到
   * `draft === saved` 就不发请求，第二版静默丢失。
   */
  const lastSyncedRef = useRef({ id: detail.id, saved });
  useEffect(() => {
    const previous = lastSyncedRef.current;
    lastSyncedRef.current = { id: detail.id, saved };
    if (previous.id !== detail.id) {
      setDraft(saved);
      return;
    }
    setDraft((current) => (current === previous.saved ? saved : current));
  }, [detail.id, saved]);

  const title = t(`${RISK_I18N}.detail.${field.labelKey}`);

  if (!editable) {
    // 可空的两段空着就不占地；描述是必填，空着（老数据）时留一行占位
    if (!saved) {
      if (!field.required) return null;
      return (
        <Block title={title}>
          <EmptyLine text={t(`${RISK_I18N}.detail.unset`)} />
        </Block>
      );
    }
    return (
      <Block title={title}>
        <p className={cn(FIELD_LINE_CLASS, "break-words whitespace-pre-wrap text-secondary")}>{saved}</p>
      </Block>
    );
  }

  return (
    <Block title={title}>
      <AutoGrowTextArea
        value={draft}
        placeholder={t(`${RISK_I18N}.${field.placeholderKey}`)}
        aria-label={title}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next === saved || (field.required && !next)) {
            setDraft(saved);
            return;
          }
          setDraft(next);
          const payload: TUpdateRiskPayload = {};
          payload[field.key] = next;
          onUpdate(payload);
        }}
        className={cn(
          FIELD_BOX_CLASS,
          FIELD_LINE_CLASS,
          "w-[calc(100%+1.25rem)] max-h-[480px] overflow-y-auto text-primary placeholder:text-placeholder"
        )}
      />
    </Block>
  );
};
