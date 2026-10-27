import type { ERiskCategory, ERiskLevel, ERiskStatus, ERiskStrategy, TRiskScale } from "@plane/types";
import { renderFormattedDate, renderFormattedDateTime } from "@plane/utils";

/** 文案都在 i18n 的 `risk` 命名空间下 */
export const RISK_I18N = "risk";

export const riskStatusLabelKey = (status: ERiskStatus) => `${RISK_I18N}.status.${status}`;
export const riskCategoryLabelKey = (category: ERiskCategory) => `${RISK_I18N}.category.${category}`;
export const riskLevelLabelKey = (level: ERiskLevel) => `${RISK_I18N}.level.${level}`;
export const riskStrategyLabelKey = (strategy: ERiskStrategy) => `${RISK_I18N}.strategy.${strategy}`;

const SCALE_KEYS: Record<TRiskScale, string> = {
  1: "very_low",
  2: "low",
  3: "medium",
  4: "high",
  5: "very_high",
};
/** 五档的文案 key：「1-很低」…「5-很高」，数值写在文案里（等级就是两者相乘） */
export const riskScaleLabelKey = (scale: TRiskScale) => `${RISK_I18N}.scale.${SCALE_KEYS[scale]}`;
/** 发生概率每档对应的区间「<10%」…「>70%」；表单里淡色显示，所以单独一个 key */
export const riskProbabilityRangeKey = (scale: TRiskScale) => `${RISK_I18N}.probability_range.${SCALE_KEYS[scale]}`;

export type TRiskScaleField = "impact_level" | "probability";

/** 详情里日期只有一种写法，与列表一致：日期字段 `2026-10-24` */
export const formatRiskDate = (value: string | null | undefined) => renderFormattedDate(value, "yyyy-MM-dd") ?? "";

/** 时间戳（活动、评论、创建 / 更新）按本地时区写成 `2026-10-26 18:54`；`withTime=false` 只要日期 */
export const formatRiskDateTime = (value: string | null | undefined, withTime = true) =>
  renderFormattedDateTime(value).slice(0, withTime ? 16 : 10);

/** 一档的完整文案：影响程度「4-高」，发生概率「4-高(51-70%)」 */
export const getRiskScaleLabel = (t: (key: string) => string, field: TRiskScaleField, scale: TRiskScale) =>
  field === "probability"
    ? `${t(riskScaleLabelKey(scale))}(${t(riskProbabilityRangeKey(scale))})`
    : t(riskScaleLabelKey(scale));

/**
 * 状态药丸：圆点 + 底色。等级与状态分两种画法（状态圆点药丸、等级方点色字），扫表时不混。
 * 只能用设计系统的语义 token（`warning / danger / success / accent`）：这套 Tailwind 主题没有
 * `red-500` 之类的默认色板，写了不生效，亮 / 暗主题也靠 token 自动跟。
 */
export const RISK_STATUS_STYLE: Record<ERiskStatus, { dot: string; pill: string }> = {
  draft: { dot: "bg-current", pill: "bg-layer-3 text-secondary" },
  pending_assessment: { dot: "bg-warning-primary", pill: "bg-warning-subtle text-warning-primary" },
  tracking: { dot: "bg-accent-primary", pill: "bg-accent-subtle text-accent-primary" },
  converted: { dot: "bg-danger-primary", pill: "bg-danger-subtle text-danger-primary" },
  not_occurred: { dot: "bg-success-primary", pill: "bg-success-subtle text-success-primary" },
};

/** 等级：方点 + 色字，不带底色。中档复用 warning（主题里没有独立的橙） */
export const RISK_LEVEL_STYLE: Record<ERiskLevel, { square: string; text: string }> = {
  high: { square: "bg-danger-primary", text: "text-danger-primary" },
  medium: { square: "bg-warning-primary", text: "text-warning-primary" },
  low: { square: "bg-success-primary", text: "text-success-primary" },
};

/** 新建 / 编辑弹窗页脚「必填 x / 8」按这 8 项数 */
export const RISK_REQUIRED_FIELDS = [
  "name",
  "status",
  "description",
  "proposer_id",
  "proposed_date",
  "owner_id",
  "impact_level",
  "probability",
] as const;

/** 判定「缺陷」看工作项类型的类别名，口径同缺陷页与后端 utils/risk.py */
export const DEFECT_CATEGORY_NAME = "缺陷";
