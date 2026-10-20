import type { ReactNode, RefObject } from "react";
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { MODAL_FIELD_CLASS, ModalFieldLabel, ModalInlineError } from "@/components/common/form-modal";
import { RISK_I18N } from "../constants";
import { RiskAssessmentField } from "./risk-assessment-field";
import type { TRiskFormPatch, TRiskFormValue } from "./risk-form-state";
import { RiskStrategySegmented } from "./risk-strategy-segmented";
import { RiskTextAreaField } from "./risk-text-area-field";

const TEXT_INPUT_CLASS = cn(
  MODAL_FIELD_CLASS,
  "border-subtle-1 bg-surface-1 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
);

/**
 * 弹窗左栏：按填写顺序排 —— 名称（身份区）、风险描述、评估（影响程度 / 发生概率 / 风险等级）、
 * 影响描述、应对措施、风险损失、触发因素、风险管理策略、附件。其余点选类属性在右栏。
 */
export const RiskFormContent = ({
  title,
  codeLabel,
  value,
  patch,
  nameError,
  descriptionError,
  assessmentError,
  nameRef,
  attachments,
}: {
  /** 左上角小标题：新建风险 / 编辑风险 */
  title: string;
  /** 编号芯片：编辑时是编号（或「生成中 / 未同步」），新建时是「保存后由简道云生成」 */
  codeLabel: string;
  value: TRiskFormValue;
  patch: TRiskFormPatch;
  nameError?: string;
  descriptionError?: string;
  /** 影响程度 / 发生概率没选全 */
  assessmentError?: string;
  nameRef: RefObject<HTMLInputElement>;
  /** 附件字段（状态在弹窗里），排在最后 */
  attachments: ReactNode;
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* 身份区 */}
      <div className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-x-4">
        <div className="mt-0.5 grid size-13 place-items-center rounded-[14px] bg-accent-subtle text-accent-primary">
          <ShieldAlert className="size-6.5" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-12 text-tertiary">
            <span>{title}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex h-5.5 items-center rounded-md bg-layer-3 px-2 font-mono text-12 font-medium text-secondary">
              {codeLabel}
            </span>
          </p>
          {/* 名称必填：输入框按内容（空时按占位）定宽，红星紧跟在字后面；下划线挂在外层整行 */}
          <label
            className={cn(
              "mt-1.5 flex min-w-0 items-baseline border-b-2 py-1 focus-within:border-accent-strong",
              nameError ? "border-danger-strong" : "border-transparent"
            )}
          >
            <input
              ref={nameRef}
              type="text"
              autoComplete="off"
              value={value.name}
              maxLength={255}
              aria-label={t(`${RISK_I18N}.fields.name`)}
              placeholder={t(`${RISK_I18N}.form.name_placeholder`)}
              onChange={(event) => patch({ name: event.target.value })}
              className="max-w-full min-w-[2em] border-0 bg-transparent p-0 text-24 leading-tight font-semibold tracking-tight text-primary outline-none [field-sizing:content] placeholder:font-medium placeholder:text-placeholder"
            />
            <span className="ml-1 shrink-0 text-20 leading-tight text-danger-primary" aria-hidden="true">
              *
            </span>
          </label>
          {nameError && <ModalInlineError message={nameError} />}
        </div>
      </div>

      {/* 风险描述（必填）；三段文本都能放大编辑 */}
      <RiskTextAreaField
        id="description"
        label={t(`${RISK_I18N}.fields.description`)}
        required
        error={descriptionError}
        value={value.description}
        placeholder={t(`${RISK_I18N}.form.editor_placeholder`)}
        minHeightClass="min-h-[160px]"
        maxHeightClass="max-h-[320px]"
        onChange={(next) => patch({ description: next })}
      />

      {/* 影响程度 / 发生概率 / 风险等级 */}
      <RiskAssessmentField
        impactLevel={value.impactLevel}
        probability={value.probability}
        riskLevel={value.riskLevel}
        error={assessmentError}
        onChange={(next) => patch(next)}
      />

      {/* 影响描述 / 应对措施：各占一整行；框有高度上限，超出在框里滚 */}
      <RiskTextAreaField
        id="impact-description"
        label={t(`${RISK_I18N}.fields.impact_description`)}
        value={value.impactDescription}
        minHeightClass="min-h-[120px]"
        maxHeightClass="max-h-[240px]"
        onChange={(next) => patch({ impactDescription: next })}
      />
      <RiskTextAreaField
        id="response-measures"
        label={t(`${RISK_I18N}.fields.response_measures`)}
        value={value.responseMeasures}
        minHeightClass="min-h-[120px]"
        maxHeightClass="max-h-[240px]"
        onChange={(next) => patch({ responseMeasures: next })}
      />

      {/* 风险损失 / 触发因素：各占一整行 */}
      <div className="min-w-0">
        <ModalFieldLabel htmlFor="risk-loss">{t(`${RISK_I18N}.fields.risk_loss`)}</ModalFieldLabel>
        <input
          id="risk-loss"
          type="text"
          value={value.riskLoss}
          maxLength={255}
          onChange={(event) => patch({ riskLoss: event.target.value })}
          className={TEXT_INPUT_CLASS}
        />
      </div>
      <div className="min-w-0">
        <ModalFieldLabel htmlFor="risk-trigger">{t(`${RISK_I18N}.fields.trigger_factors`)}</ModalFieldLabel>
        <input
          id="risk-trigger"
          type="text"
          value={value.triggerFactors}
          maxLength={255}
          onChange={(event) => patch({ triggerFactors: event.target.value })}
          className={TEXT_INPUT_CLASS}
        />
      </div>

      {/* 风险管理策略：四段，选中档主色填满 */}
      <div>
        <ModalFieldLabel>{t(`${RISK_I18N}.fields.strategy`)}</ModalFieldLabel>
        <RiskStrategySegmented value={value.strategy} onChange={(next) => patch({ strategy: next })} />
      </div>

      {attachments}
    </div>
  );
};
