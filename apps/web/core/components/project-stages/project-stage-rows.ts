import type { TProjectStage, TProjectStageIssueStateCounts } from "@plane/types";

export type TProjectStageRow = {
  stage: TProjectStage;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
};

const bySortOrder = (a: TProjectStage, b: TProjectStage) =>
  a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

/** 扁平列表 → 按 parent_id 建树 → 深度优先铺成行。层级不限；折叠的子树不出行 */
export const buildProjectStageRows = (
  stages: TProjectStage[],
  expandedIds: Set<string>,
  isHit: (stage: TProjectStage) => boolean
): TProjectStageRow[] => {
  const childrenOf = new Map<string | null, TProjectStage[]>();
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  for (const stage of stages) {
    // 父不在列表里（不该发生）当根处理，别把行丢了
    const parentKey = stage.parent_id && byId.has(stage.parent_id) ? stage.parent_id : null;
    const bucket = childrenOf.get(parentKey) ?? [];
    bucket.push(stage);
    childrenOf.set(parentKey, bucket);
  }
  for (const bucket of childrenOf.values()) bucket.sort(bySortOrder);

  // 搜索命中：自己命中，或子树里有命中的（父要带出来）
  const hitMemo = new Map<string, boolean>();
  const subtreeHit = (stage: TProjectStage): boolean => {
    const cached = hitMemo.get(stage.id);
    if (cached !== undefined) return cached;
    const value = isHit(stage) || (childrenOf.get(stage.id) ?? []).some(subtreeHit);
    hitMemo.set(stage.id, value);
    return value;
  };

  const rows: TProjectStageRow[] = [];
  const walk = (parentKey: string | null, depth: number) => {
    const siblings = (childrenOf.get(parentKey) ?? []).filter(subtreeHit);
    for (const stage of siblings) {
      const children = childrenOf.get(stage.id) ?? [];
      const hasChildren = children.length > 0;
      const isExpanded = hasChildren && expandedIds.has(stage.id);
      rows.push({ stage, depth, hasChildren, isExpanded });
      if (isExpanded) walk(stage.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
};

/** 全部展开、不筛选的树先序：给阶段下拉这类只要顺序和缩进的地方用 */
export const orderProjectStages = (stages: TProjectStage[]) =>
  buildProjectStageRows(stages, new Set(stages.map((stage) => stage.id)), () => true).map(({ stage, depth }) => ({
    stage,
    depth,
  }));

/**
 * 子树合计（自身 + 所有后代）：阶段页「迭代 / 工作项」列用。后端回的 cycle_count / issue_count
 * 只是直接挂在该阶段上的数，父阶段要把子阶段的一起算进去。
 */
/** 某阶段自身 + 所有后代的 id（阶段页计数链接跳迭代列表时按子树筛） */
export const collectProjectStageSubtreeIds = (stages: TProjectStage[], rootId: string): string[] => {
  const childrenOf = new Map<string, string[]>();
  for (const stage of stages) {
    if (!stage.parent_id) continue;
    childrenOf.set(stage.parent_id, [...(childrenOf.get(stage.parent_id) ?? []), stage.id]);
  }
  const ids: string[] = [];
  const walk = (id: string) => {
    ids.push(id);
    (childrenOf.get(id) ?? []).forEach(walk);
  };
  walk(rootId);
  return ids;
};

export const sumProjectStageSubtree = (
  stages: TProjectStage[],
  pick: (stage: TProjectStage) => number
): Map<string, number> => {
  const childrenOf = new Map<string, TProjectStage[]>();
  for (const stage of stages) {
    if (!stage.parent_id) continue;
    const bucket = childrenOf.get(stage.parent_id) ?? [];
    bucket.push(stage);
    childrenOf.set(stage.parent_id, bucket);
  }
  const totals = new Map<string, number>();
  const total = (stage: TProjectStage): number => {
    const cached = totals.get(stage.id);
    if (cached !== undefined) return cached;
    const value = pick(stage) + (childrenOf.get(stage.id) ?? []).reduce((sum, child) => sum + total(child), 0);
    totals.set(stage.id, value);
    return value;
  };
  for (const stage of stages) total(stage);
  return totals;
};

/** 工作项的五个状态组，状态分布按这个顺序出 */
export const PROJECT_STAGE_ISSUE_STATE_GROUPS = ["backlog", "unstarted", "started", "completed", "cancelled"] as const;

/** 某阶段自身 + 所有后代的工作项按状态组合计：阶段详情页的完成进度与状态分布 */
export const sumProjectStageStateCounts = (stages: TProjectStage[], rootId: string): TProjectStageIssueStateCounts => {
  const ids = new Set(collectProjectStageSubtreeIds(stages, rootId));
  const total: TProjectStageIssueStateCounts = { backlog: 0, unstarted: 0, started: 0, completed: 0, cancelled: 0 };
  for (const stage of stages) {
    if (!ids.has(stage.id)) continue;
    for (const group of PROJECT_STAGE_ISSUE_STATE_GROUPS) total[group] += stage.issue_state_counts?.[group] ?? 0;
  }
  return total;
};

/** 单个阶段直接挂的工作项数（列表口径）。`issue_count` 含已归档 / 草稿，只给删除确认用 */
export const getProjectStageIssueTotal = (stage: TProjectStage) =>
  PROJECT_STAGE_ISSUE_STATE_GROUPS.reduce((sum, group) => sum + (stage.issue_state_counts?.[group] ?? 0), 0);

/** 完成进度：已完成 ÷（总数 − 已取消），口径同迭代 */
export const getProjectStageProgress = (counts: TProjectStageIssueStateCounts) => {
  const total = PROJECT_STAGE_ISSUE_STATE_GROUPS.reduce((sum, group) => sum + counts[group], 0);
  const effective = total - counts.cancelled;
  return {
    total,
    effective,
    completed: counts.completed,
    cancelled: counts.cancelled,
    percent: effective > 0 ? Math.round((counts.completed / effective) * 100) : 0,
  };
};

/** 计算「已延期 N 天」：计划结束到今天的自然日差 */
export const delayedDays = (endDate: string, today: string) => {
  const end = new Date(`${endDate}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  return Math.max(1, Math.round((now.getTime() - end.getTime()) / 86400000));
};
