import type { TProjectStage } from "@plane/types";

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

/** 计算「已延期 N 天」：计划结束到今天的自然日差 */
export const delayedDays = (endDate: string, today: string) => {
  const end = new Date(`${endDate}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  return Math.max(1, Math.round((now.getTime() - end.getTime()) / 86400000));
};
