import type {
  ERiskCategory,
  ERiskLevel,
  ERiskStrategy,
  TCreateRiskPayload,
  TRiskDetail,
  TRiskScale,
  TUpdateRiskPayload,
} from "@plane/types";
import { ERiskStatus } from "@plane/types";
import { RISK_REQUIRED_FIELDS } from "../constants";

export type TRiskRequiredField = (typeof RISK_REQUIRED_FIELDS)[number];

/** 弹窗里的表单值：字段名用前端驼峰，提交时再拼成接口 payload */
export type TRiskFormValue = {
  name: string;
  status: ERiskStatus;
  category: ERiskCategory | "";
  description: string;
  impactDescription: string;
  responseMeasures: string;
  impactLevel: TRiskScale | null;
  probability: TRiskScale | null;
  /** 改影响程度 / 发生概率时推算出来，也可以手动改 */
  riskLevel: ERiskLevel | null;
  riskLoss: string;
  triggerFactors: string;
  strategy: ERiskStrategy | "";
  isInRiskProduction: boolean | null;
  proposerId: string | null;
  proposedDate: string | null;
  ownerId: string | null;
  stakeholderIds: string[];
  plannedHandleDate: string | null;
  actualCloseDate: string | null;
};

export type TRiskFormPatch = (next: Partial<TRiskFormValue>) => void;

export const EMPTY_RISK_FORM: TRiskFormValue = {
  name: "",
  status: ERiskStatus.DRAFT,
  category: "",
  description: "",
  impactDescription: "",
  responseMeasures: "",
  impactLevel: null,
  probability: null,
  riskLevel: null,
  riskLoss: "",
  triggerFactors: "",
  strategy: "",
  isInRiskProduction: null,
  proposerId: null,
  proposedDate: null,
  ownerId: null,
  stakeholderIds: [],
  plannedHandleDate: null,
  actualCloseDate: null,
};

export const riskFormFromDetail = (risk: TRiskDetail): TRiskFormValue => ({
  name: risk.name,
  status: risk.status,
  category: risk.category,
  description: risk.description ?? "",
  impactDescription: risk.impact_description ?? "",
  responseMeasures: risk.response_measures ?? "",
  impactLevel: risk.impact_level,
  probability: risk.probability,
  riskLevel: risk.risk_level || null,
  riskLoss: risk.risk_loss ?? "",
  triggerFactors: risk.trigger_factors ?? "",
  strategy: risk.strategy,
  isInRiskProduction: risk.is_in_risk_production,
  proposerId: risk.proposer,
  proposedDate: risk.proposed_date,
  ownerId: risk.owner,
  stakeholderIds: risk.stakeholder_ids,
  plannedHandleDate: risk.planned_handle_date,
  actualCloseDate: risk.actual_close_date,
});

/** 8 个必填项各自填了没有：页脚计数与缺项标红都看它 */
export const getRiskFilledMap = (value: TRiskFormValue): Record<TRiskRequiredField, boolean> => ({
  name: value.name.trim() !== "",
  status: Boolean(value.status),
  description: value.description.trim() !== "",
  proposer_id: Boolean(value.proposerId),
  proposed_date: Boolean(value.proposedDate),
  owner_id: Boolean(value.ownerId),
  impact_level: value.impactLevel !== null,
  probability: value.probability !== null,
});

/** 提交前已校验过必填，这里直接拼 payload；等级没选过就不传，后端按两项推算 */
export const toRiskPayload = (value: TRiskFormValue): TCreateRiskPayload => ({
  name: value.name.trim(),
  status: value.status,
  category: value.category,
  description: value.description.trim(),
  impact_description: value.impactDescription.trim(),
  response_measures: value.responseMeasures.trim(),
  impact_level: value.impactLevel!,
  probability: value.probability!,
  risk_level: value.riskLevel ?? undefined,
  risk_loss: value.riskLoss.trim(),
  trigger_factors: value.triggerFactors.trim(),
  strategy: value.strategy,
  is_in_risk_production: value.isInRiskProduction,
  proposer_id: value.proposerId!,
  proposed_date: value.proposedDate!,
  owner_id: value.ownerId!,
  stakeholder_ids: value.stakeholderIds,
  planned_handle_date: value.plannedHandleDate,
  actual_close_date: value.actualCloseDate,
});

/**
 * 详情「编辑 → 保存」只发改过的字段：拿进入编辑时的值和当前值各拼一份 payload 逐项比，
 * 没动的不发（不会盖掉别人同时改的字段，轨迹也只记真改了的）。等级没变就不带，后端按两项自己推算。
 */
export const toRiskUpdatePayload = (base: TRiskFormValue, value: TRiskFormValue): TUpdateRiskPayload => {
  const before = toRiskPayload(base) as Record<string, unknown>;
  const after = toRiskPayload(value) as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const [key, next] of Object.entries(after)) {
    const prev = before[key];
    const isSame = Array.isArray(next) && Array.isArray(prev) ? next.join(",") === prev.join(",") : next === prev;
    if (!isSame) payload[key] = next;
  }
  return payload as TUpdateRiskPayload;
};
