import type { IUserLite } from "./users";

/**
 * 项目风险（自研模块）：项目子菜单，与工作项 / 发布 / 迭代平级；与缺陷多对多。
 *
 * - `code` 由后端生成：PRS + 年月 + 当月流水号，工作区内按月重置，不可改。
 * - `risk_level` 按影响程度 × 发生概率（各 1–5）推算：乘积 ≥ 12 高、6–10 中、≤ 5 低；之后可以手动改，
 *   手动改不动影响程度和发生概率，再改这两项时重新推算并覆盖手动值。推算规则在后端
 *   `utils/risk.py::compute_risk_level`，`computeRiskLevel` 是它的镜像；当前等级与推算值不同即「手动调整」。
 * - 必填：名称、状态、风险描述、提出人、提出时间、责任人、影响程度、发生概率。
 */

export enum ERiskStatus {
  DRAFT = "draft",
  PENDING_ASSESSMENT = "pending_assessment",
  TRACKING = "tracking",
  CONVERTED = "converted",
  NOT_OCCURRED = "not_occurred",
}

export const RISK_STATUSES: ERiskStatus[] = [
  ERiskStatus.DRAFT,
  ERiskStatus.PENDING_ASSESSMENT,
  ERiskStatus.TRACKING,
  ERiskStatus.CONVERTED,
  ERiskStatus.NOT_OCCURRED,
];

export enum ERiskCategory {
  SCHEDULE = "schedule",
  COST = "cost",
  QUALITY = "quality",
  RESOURCE = "resource",
  SOFTWARE_DESIGN = "software_design",
  HARDWARE_SOLUTION = "hardware_solution",
  STRUCTURE_SOLUTION = "structure_solution",
  MATERIAL = "material",
  RELIABILITY = "reliability",
  DFM = "dfm",
  DEFECT = "defect",
}

export const RISK_CATEGORIES: ERiskCategory[] = [
  ERiskCategory.SCHEDULE,
  ERiskCategory.COST,
  ERiskCategory.QUALITY,
  ERiskCategory.RESOURCE,
  ERiskCategory.SOFTWARE_DESIGN,
  ERiskCategory.HARDWARE_SOLUTION,
  ERiskCategory.STRUCTURE_SOLUTION,
  ERiskCategory.MATERIAL,
  ERiskCategory.RELIABILITY,
  ERiskCategory.DFM,
  ERiskCategory.DEFECT,
];

/** 影响程度 / 发生概率共用的五档，值就是参与相乘的分数 */
export type TRiskScale = 1 | 2 | 3 | 4 | 5;
export const RISK_SCALES: TRiskScale[] = [1, 2, 3, 4, 5];

export enum ERiskLevel {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export const RISK_LEVELS: ERiskLevel[] = [ERiskLevel.HIGH, ERiskLevel.MEDIUM, ERiskLevel.LOW];

export enum ERiskStrategy {
  AVOID = "avoid",
  TRANSFER = "transfer",
  MITIGATE = "mitigate",
  ACCEPT = "accept",
}

export const RISK_STRATEGIES: ERiskStrategy[] = [
  ERiskStrategy.AVOID,
  ERiskStrategy.TRANSFER,
  ERiskStrategy.MITIGATE,
  ERiskStrategy.ACCEPT,
];

export const RISK_LEVEL_HIGH_MIN = 12;
export const RISK_LEVEL_LOW_MAX = 5;

/** 后端 `compute_risk_level` 的镜像：表单里改影响程度 / 发生概率时推算等级，也用来判断当前等级是不是手动改过 */
export const computeRiskLevel = (
  impactLevel: number | null | undefined,
  probability: number | null | undefined
): ERiskLevel | null => {
  if (!impactLevel || !probability) return null;
  const score = impactLevel * probability;
  if (score >= RISK_LEVEL_HIGH_MIN) return ERiskLevel.HIGH;
  if (score <= RISK_LEVEL_LOW_MAX) return ERiskLevel.LOW;
  return ERiskLevel.MEDIUM;
};

/** 列表行 */
export type TRisk = {
  id: string;
  workspace: string;
  project: string;
  code: string;
  name: string;
  status: ERiskStatus;
  category: ERiskCategory | "";
  impact_level: TRiskScale;
  probability: TRiskScale;
  risk_level: ERiskLevel;
  /** impact_level × probability */
  risk_score: number;
  strategy: ERiskStrategy | "";
  is_in_risk_production: boolean | null;
  proposer: string | null;
  proposer_detail: IUserLite | null;
  proposed_date: string;
  owner: string | null;
  owner_detail: IUserLite | null;
  stakeholder_ids: string[];
  planned_handle_date: string | null;
  actual_close_date: string | null;
  /** 关联的、未删除的缺陷数 */
  issue_count: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** 详情 = 列表行 + 三段富文本 + 两个单行文本 + 干系人明细 */
export type TRiskDetail = TRisk & {
  description_html: string;
  impact_description_html: string;
  response_measures_html: string;
  risk_loss: string;
  trigger_factors: string;
  stakeholder_details: IUserLite[];
};

export type TCreateRiskPayload = {
  name: string;
  status?: ERiskStatus;
  category?: ERiskCategory | "";
  description_html: string;
  impact_description_html?: string;
  response_measures_html?: string;
  impact_level: TRiskScale;
  probability: TRiskScale;
  /** 不传按影响程度 × 发生概率推算；传了以它为准（手动调整） */
  risk_level?: ERiskLevel;
  risk_loss?: string;
  trigger_factors?: string;
  strategy?: ERiskStrategy | "";
  is_in_risk_production?: boolean | null;
  /** 不传后端默认当前用户 */
  proposer_id?: string;
  /** 不传后端默认今天 */
  proposed_date?: string;
  owner_id: string;
  stakeholder_ids?: string[];
  planned_handle_date?: string | null;
  actual_close_date?: string | null;
};

export type TUpdateRiskPayload = Partial<TCreateRiskPayload>;

/** 关联缺陷的轻量行，形状同需求 ↔ 工作项列表 */
export type TRiskLinkedIssue = {
  id: string;
  name: string;
  sequence_id: number;
  priority: string | null;
  project_id: string;
  project_identifier: string;
  type_id: string | null;
  state_id: string | null;
  state_name: string | null;
  state_group: string | null;
  state_color: string | null;
  assignee_ids: string[];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TRiskComment = {
  id: string;
  workspace: string;
  project: string;
  risk: string;
  actor: string | null;
  actor_detail: IUserLite | null;
  comment_stripped: string;
  comment_json: Record<string, unknown>;
  comment_html: string;
  parent: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TCreateRiskCommentPayload = {
  comment_html: string;
  comment_json?: Record<string, unknown>;
  parent?: string | null;
};

/**
 * 变更历史。`field` 取值：
 * - 普通字段（name / status / category / impact_level / probability / risk_loss / trigger_factors /
 *   strategy / is_in_risk_production / proposed_date / planned_handle_date / actual_close_date）：old_value → new_value
 * - `risk_level`：影响程度 / 发生概率改动引起的重新推算 `extra.auto === true`；手动调整是普通字段改动
 * - proposer / owner：old_value / new_value 是用户 id
 * - stakeholders：verb added / removed，各带一个用户 id（new_identifier / old_identifier）
 * - description_html / impact_description_html / response_measures_html：只记「改了」，两边都空
 * - issues：verb added / removed，identifier 是工作项 id
 * - attachment：verb created / deleted，value 是文件名
 * - comment：verb created，`comment` 是正文摘要，`risk_comment` 指向评论
 */
export type TRiskActivity = {
  id: string;
  risk: string;
  actor: string | null;
  actor_detail: IUserLite | null;
  verb: "created" | "updated" | "added" | "removed" | "deleted";
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  comment: string;
  risk_comment: string | null;
  old_identifier: string | null;
  new_identifier: string | null;
  epoch: number | null;
  extra: Record<string, unknown>;
  created_at: string;
};

export type TRiskAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  is_uploaded: boolean;
  created_at: string;
  created_by_id: string | null;
  created_by_detail: IUserLite | null;
};
