/**
 * 一个项目里、本产品需求的交付状态分布条 + 完成率。
 *
 * 这是产品侧「关联项目」列表能回答「我的需求被哪些项目在做、做到哪了」的关键 ——
 * 在此之前那张表只有项目名和关联时间，一个量化信息都没有。
 *
 * **完成率两套口径**：该项目下本产品需求有 live 关联工作项（RequirementIssue）时
 * 按任务算 = 已完成 / (工作项数 − 已取消)，与项目需求网格「工作项」列同一算法；
 * 零工作项时退回状态口径 = 已发布 / (总数 − 已关闭)。tooltip 里把口径说清楚，
 * 免得两套数字被混着解读。
 */
import type { FC } from "react";
import { useTranslation } from "@plane/i18n";
import type { TProductProject, TRequirementItemStatus } from "@plane/types";
import { REQUIREMENT_STATUSES } from "@plane/types";
import { LinearProgressIndicator } from "@plane/ui";

/**
 * 与 REQUIREMENT_STATUS_STYLE 的胶囊同一套语义：越靠后越接近完成，closed 用比
 * not_started 更退场的中性色。LinearProgressIndicator 走 style.backgroundColor，
 * 吃不到 Tailwind class，所以直接引 packages/tailwind-config/variables.css 里的语义变量，
 * 明暗主题自动跟随。中性两档没有 --bg-* 级别的中性主色，借文字色的两级灰。
 */
const STATUS_BAR_COLOR: Record<TRequirementItemStatus, string> = {
  not_started: "var(--txt-tertiary)",
  projected: "var(--bg-accent-primary)",
  in_progress: "var(--bg-warning-primary)",
  released: "var(--bg-success-primary)",
  closed: "var(--txt-placeholder)",
};

/**
 * 后端 status_counts_by_project 的 bucket：五个状态键之外混发 issue_total /
 * issue_completed / issue_cancelled 三个工作项聚合键。TProductProject.status_counts
 * 的类型目前只声明了状态键，这里按可选键放宽接收 —— 缺键按 0 处理，等价于零工作项。
 */
type TStatusCountsBucket = TProductProject["status_counts"] & {
  /** 本产品需求在该项目下的 live 关联工作项总数。>0 时完成率改按任务口径 */
  issue_total?: number;
  /** 其中 state.group=completed 的条数（任务口径的分子） */
  issue_completed?: number;
  /** 其中 state.group=cancelled 的条数（任务口径分母的扣减项） */
  issue_cancelled?: number;
};

type TProps = {
  statusCounts: TStatusCountsBucket | undefined;
  total: number;
};

export const ProductProjectStatusBar: FC<TProps> = ({ statusCounts, total }) => {
  const { t } = useTranslation();

  if (!total) return <span className="text-11 text-placeholder">—</span>;

  const data = REQUIREMENT_STATUSES.map((status) => ({
    id: status,
    name: t(`requirement_fields.statuses.${status}`),
    value: statusCounts?.[status] ?? 0,
    color: STATUS_BAR_COLOR[status],
  }));

  return <LinearProgressIndicator size="md" data={data} />;
};

export const getCompletionRate = (statusCounts: TStatusCountsBucket | undefined, total: number) => {
  if (!total || !statusCounts) return 0;
  const issueTotal = statusCounts.issue_total ?? 0;
  if (issueTotal > 0) {
    // 任务口径：分母去掉已取消（cancelled 既不算没做也不算做完），与项目需求网格一致。
    // 工作项全部被取消时分母为 0，任务口径失去意义 —— 退回状态口径而不是显示 0%。
    const effectiveTotal = issueTotal - (statusCounts.issue_cancelled ?? 0);
    if (effectiveTotal > 0) {
      return Math.round(((statusCounts.issue_completed ?? 0) / effectiveTotal) * 100);
    }
  }
  // 状态口径：已关闭的需求不算在分母里（既不算没做也不算做完），全关闭时分母为 0 → 0%
  const effectiveTotal = total - (statusCounts.closed ?? 0);
  if (effectiveTotal <= 0) return 0;
  return Math.round(((statusCounts.released ?? 0) / effectiveTotal) * 100);
};
