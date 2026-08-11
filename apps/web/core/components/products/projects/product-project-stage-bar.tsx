/**
 * 一个项目里、本产品需求的阶段分布条 + 完成率。
 *
 * 这是产品侧「关联项目」列表能回答「我的需求被哪些项目在做、做到哪了」的关键 ——
 * 在此之前那张表只有项目名和关联时间，一个量化信息都没有。
 *
 * **完成率按阶段算，不是按任务算**：需求↔工作项的派生（RequirementIssue）属于 P3，
 * 尚未实现，所以这里 = (研发完毕 + 已发布) / 总数。tooltip 里把口径说清楚，免得被
 * 当成禅道那种基于任务完成度的进度。
 */
import type { FC } from "react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementProjectStage } from "@plane/types";
import { REQUIREMENT_PROJECT_STAGES } from "@plane/types";
import { LinearProgressIndicator } from "@plane/ui";

/** 与网格里的阶段胶囊同一套语义顺序：越靠后越接近完成 */
const STAGE_BAR_COLOR: Record<TRequirementProjectStage, string> = {
  linked: "#9ca3af",
  planned: "#6366f1",
  in_progress: "#f59e0b",
  done: "#22c55e",
  released: "#15803d",
};

type TProps = {
  stageCounts: Record<TRequirementProjectStage, number> | undefined;
  total: number;
};

export const ProductProjectStageBar: FC<TProps> = ({ stageCounts, total }) => {
  const { t } = useTranslation();

  if (!total) return <span className="text-11 text-placeholder">—</span>;

  const data = REQUIREMENT_PROJECT_STAGES.map((stage) => ({
    id: stage,
    name: t(`project_requirements.stage.${stage}`),
    value: stageCounts?.[stage] ?? 0,
    color: STAGE_BAR_COLOR[stage],
  }));

  return <LinearProgressIndicator size="md" data={data} />;
};

export const getCompletionRate = (
  stageCounts: Record<TRequirementProjectStage, number> | undefined,
  total: number
) => {
  if (!total || !stageCounts) return 0;
  return Math.round((((stageCounts.done ?? 0) + (stageCounts.released ?? 0)) / total) * 100);
};
