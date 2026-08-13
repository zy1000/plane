/**
 * 一个项目里、本产品需求的阶段分布条 + 完成率。
 *
 * 这是产品侧「关联项目」列表能回答「我的需求被哪些项目在做、做到哪了」的关键 ——
 * 在此之前那张表只有项目名和关联时间，一个量化信息都没有。
 *
 * **完成率两套口径**：该项目下本产品需求有 live 关联工作项（RequirementIssue）时
 * 按任务算 = 已完成 / (工作项数 − 已取消)，与项目需求网格「工作项」列同一算法；
 * 零工作项时退回阶段口径 = (研发完毕 + 已发布) / 总数。tooltip 里把口径说清楚，
 * 免得两套数字被混着解读。
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

/**
 * 后端 stage_counts_by_project 的 bucket：五个阶段键之外混发 issue_total /
 * issue_completed / issue_cancelled 三个工作项聚合键。TProductProject.stage_counts
 * 的类型目前只声明了阶段键，这里按可选键放宽接收 —— 缺键按 0 处理，等价于零工作项。
 */
type TStageCountsBucket = Record<TRequirementProjectStage, number> & {
  /** 本产品需求在该项目下的 live 关联工作项总数。>0 时完成率改按任务口径 */
  issue_total?: number;
  /** 其中 state.group=completed 的条数（任务口径的分子） */
  issue_completed?: number;
  /** 其中 state.group=cancelled 的条数（任务口径分母的扣减项） */
  issue_cancelled?: number;
};

type TProps = {
  stageCounts: TStageCountsBucket | undefined;
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

export const getCompletionRate = (stageCounts: TStageCountsBucket | undefined, total: number) => {
  if (!total || !stageCounts) return 0;
  const issueTotal = stageCounts.issue_total ?? 0;
  if (issueTotal > 0) {
    // 任务口径：分母去掉已取消（cancelled 既不算没做也不算做完），与项目需求网格一致。
    // 工作项全部被取消时分母为 0，任务口径失去意义 —— 退回阶段口径而不是显示 0%。
    const effectiveTotal = issueTotal - (stageCounts.issue_cancelled ?? 0);
    if (effectiveTotal > 0) {
      return Math.round(((stageCounts.issue_completed ?? 0) / effectiveTotal) * 100);
    }
  }
  return Math.round((((stageCounts.done ?? 0) + (stageCounts.released ?? 0)) / total) * 100);
};
