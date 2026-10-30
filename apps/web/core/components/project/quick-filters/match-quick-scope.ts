import type { TProject, TProjectQuickScope } from "@plane/types";

export type TProjectQuickScopeContext = {
  /** 终态（已完成 / 已取消）的字典值 id，由列表页从字典推出来塞进 store */
  closedStatusIds: ReadonlySet<string>;
  /** 今天，`YYYY-MM-DD` */
  today: string;
};

export type TProjectQuickScopeCounts = {
  all: number;
  open: number;
  overdue: number;
  no_status: number;
  archived: number;
  /** 字典值 id → 数量 */
  byStatus: Record<string, number>;
};

const STATUS_SCOPE_PREFIX = "status:";

export const statusQuickScope = (statusId: string): TProjectQuickScope => `${STATUS_SCOPE_PREFIX}${statusId}`;

const isClosed = (project: TProject, ctx: TProjectQuickScopeContext) =>
  !!project.status && ctx.closedStatusIds.has(project.status);

/** 与表格列的 isProjectOverdue 同口径：计划完成日期早于今天、状态不是终态；归档的由调用方先排除 */
const isOverdue = (project: TProject, ctx: TProjectQuickScopeContext) =>
  !!project.end_date && project.end_date.slice(0, 10) < ctx.today && !isClosed(project, ctx);

/**
 * 快捷页签的匹配：除「已归档」外的页签都只看未归档的项目。
 * 「未完成」= 状态不是终态（含未设置）；「已逾期」沿用表格列的逾期口径。
 */
export const projectMatchesQuickScope = (
  project: TProject,
  scope: TProjectQuickScope,
  ctx: TProjectQuickScopeContext
): boolean => {
  if (scope === "archived") return !!project.archived_at;
  if (project.archived_at) return false;
  switch (scope) {
    case "all":
      return true;
    case "open":
      return !isClosed(project, ctx);
    case "overdue":
      return isOverdue(project, ctx);
    case "no_status":
      return !project.status;
    default:
      return project.status === scope.slice(STATUS_SCOPE_PREFIX.length);
  }
};

/** 一次遍历算出每个页签的数量（页签之外的条件已由调用方筛过） */
export const countProjectQuickScopes = (
  projects: TProject[],
  ctx: TProjectQuickScopeContext
): TProjectQuickScopeCounts => {
  const counts: TProjectQuickScopeCounts = { all: 0, open: 0, overdue: 0, no_status: 0, archived: 0, byStatus: {} };
  for (const project of projects) {
    if (project.archived_at) {
      counts.archived += 1;
      continue;
    }
    counts.all += 1;
    if (!isClosed(project, ctx)) counts.open += 1;
    if (isOverdue(project, ctx)) counts.overdue += 1;
    if (!project.status) counts.no_status += 1;
    else counts.byStatus[project.status] = (counts.byStatus[project.status] ?? 0) + 1;
  }
  return counts;
};
