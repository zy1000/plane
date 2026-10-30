import type { TProjectStage } from "@plane/types";
import type { TProjectStagePlanCycle, TProjectStagePlanIssue } from "@/services/project-stage.service";

/**
 * 规划视图的树：阶段 › 迭代 › 工作项，铺成一行行给左栏和时间轴共用。
 *
 * 归属只影响显示位置，不改数据（工作项和迭代的阶段字段互不派生）：
 * - 迭代按自己的阶段挂；没挂阶段的进末尾「未关联阶段」组
 * - 工作项在迭代里就跟着迭代显示；不在迭代里的按自己的阶段进该阶段的「不在迭代中」，
 *   两边都没挂的进「未关联阶段 › 不在迭代中」
 * - 工作项显示位置和它自己的阶段对不上时，行里带上它自己的阶段（`ownStageId`）
 *
 * 一个阶段下先列子阶段，再列迭代，最后是「不在迭代中」。
 */

export type TPlanLevel = "stage" | "cycle" | "issue";

/** 每个迭代 / 「不在迭代中」节点默认只露这么多条，其余收进「查看全部」 */
export const PLAN_NODE_ISSUE_LIMIT = 10;

type TRowBase = { id: string; depth: number; hasToggle: boolean; expanded: boolean };

export type TPlanStageRow = TRowBase & {
  kind: "stage";
  stage: TProjectStage;
  hasChildStages: boolean;
  /** 直接挂在这个阶段上的迭代数 / 工作项数（不含子阶段），收起时显示在名称后 */
  cycleCount: number;
  issueCount: number;
  showCounts: boolean;
};
export type TPlanGroupRow = TRowBase & {
  kind: "group";
  cycleCount: number;
  issueCount: number;
  showCounts: boolean;
};
export type TPlanCycleRow = TRowBase & {
  kind: "cycle";
  cycle: TProjectStagePlanCycle;
  issueCount: number;
  /** 完成数 / （总数 − 已取消），0–100 */
  progress: number;
};
export type TPlanNoCycleRow = TRowBase & { kind: "nocycle"; issueCount: number };
export type TPlanIssueRow = TRowBase & {
  kind: "issue";
  issue: TProjectStagePlanIssue;
  ownStageId: string | null;
  /** 在迭代下面时，时间轴上铺出迭代的时间范围 */
  window: { start: string; end: string } | null;
};
export type TPlanMoreRow = TRowBase & { kind: "more"; nodeId: string; total: number };

export type TPlanRow =
  | TPlanStageRow
  | TPlanGroupRow
  | TPlanCycleRow
  | TPlanNoCycleRow
  | TPlanIssueRow
  | TPlanMoreRow;

export const PLAN_ROW_HEIGHT: Record<TPlanRow["kind"], number> = {
  stage: 40,
  group: 40,
  cycle: 36,
  nocycle: 32,
  issue: 32,
  more: 32,
};

export const planStageNodeId = (stageId: string) => `stage:${stageId}`;
export const PLAN_GROUP_NODE_ID = "group:none";
const cycleNodeId = (cycleId: string) => `cycle:${cycleId}`;
const noCycleNodeId = (stageId: string | null) => `nocycle:${stageId ?? "none"}`;

const bySortOrder = (a: TProjectStage, b: TProjectStage) =>
  a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

/** 有日期的在前、按开始排；同一天按编号 */
const byIssueSchedule = (a: TProjectStagePlanIssue, b: TProjectStagePlanIssue) => {
  const da = a.start_date ?? a.target_date;
  const db = b.start_date ?? b.target_date;
  if (da && db && da !== db) return da.localeCompare(db);
  if (da && !db) return -1;
  if (!da && db) return 1;
  return a.sequence_id - b.sequence_id;
};

const byCycleSchedule = (a: TProjectStagePlanCycle, b: TProjectStagePlanCycle) => {
  if (a.start_date && b.start_date && a.start_date !== b.start_date) return a.start_date.localeCompare(b.start_date);
  if (a.start_date && !b.start_date) return -1;
  if (!a.start_date && b.start_date) return 1;
  return a.name.localeCompare(b.name);
};

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
};

export type TBuildPlanRowsInput = {
  stages: TProjectStage[];
  cycles: TProjectStagePlanCycle[];
  issues: TProjectStagePlanIssue[];
  level: TPlanLevel;
  /** 用户手动点过展开 / 收起的节点：在默认状态上取反 */
  toggled: Set<string>;
  /** 点过「查看全部」的节点 */
  showAll: Set<string>;
  keyword: string;
  projectIdentifier: string;
};

export const buildPlanRows = (input: TBuildPlanRowsInput): TPlanRow[] => {
  const { stages, cycles, issues, level, toggled, showAll, projectIdentifier } = input;
  const keyword = input.keyword.trim().toLowerCase();
  const searching = keyword.length > 0;

  const stageIds = new Set(stages.map((stage) => stage.id));
  const childStages = new Map<string | null, TProjectStage[]>();
  for (const stage of stages) {
    const parentKey = stage.parent_id && stageIds.has(stage.parent_id) ? stage.parent_id : null;
    push(childStages, parentKey, stage);
  }
  for (const bucket of childStages.values()) bucket.sort(bySortOrder);

  const cycleIds = new Set(cycles.map((cycle) => cycle.id));
  const cyclesByStage = new Map<string | null, TProjectStagePlanCycle[]>();
  for (const cycle of cycles) {
    push(cyclesByStage, cycle.stage_id && stageIds.has(cycle.stage_id) ? cycle.stage_id : null, cycle);
  }
  for (const bucket of cyclesByStage.values()) bucket.sort(byCycleSchedule);

  const issuesByCycle = new Map<string, TProjectStagePlanIssue[]>();
  const looseByStage = new Map<string | null, TProjectStagePlanIssue[]>();
  for (const issue of issues) {
    if (issue.cycle_id && cycleIds.has(issue.cycle_id)) push(issuesByCycle, issue.cycle_id, issue);
    else push(looseByStage, issue.stage_id && stageIds.has(issue.stage_id) ? issue.stage_id : null, issue);
  }
  for (const bucket of issuesByCycle.values()) bucket.sort(byIssueSchedule);
  for (const bucket of looseByStage.values()) bucket.sort(byIssueSchedule);

  const progressOf = (cycleId: string) => {
    const list = issuesByCycle.get(cycleId) ?? [];
    const counted = list.filter((issue) => issue.state_group !== "cancelled");
    if (counted.length === 0) return 0;
    const done = counted.filter((issue) => issue.state_group === "completed").length;
    return Math.round((done / counted.length) * 100);
  };

  // ---- 搜索：命中自己，或子孙里有命中的才出现；节点自己命中时整棵带出 ----
  const hitText = (text: string) => text.toLowerCase().includes(keyword);
  const issueHit = (issue: TProjectStagePlanIssue) =>
    hitText(issue.name) || hitText(`${projectIdentifier}-${issue.sequence_id}`);
  const pickIssues = (list: TProjectStagePlanIssue[], ancestorHit: boolean) =>
    !searching || ancestorHit ? list : list.filter(issueHit);

  /** 某阶段（或 null = 未关联组）直接挂的内容，搜索过滤后 */
  const contentOf = (stageKey: string | null, ancestorHit: boolean) => {
    const contentCycles = (cyclesByStage.get(stageKey) ?? [])
      .map((cycle) => {
        const cycleHit = ancestorHit || (searching && hitText(cycle.name));
        const list = issuesByCycle.get(cycle.id) ?? [];
        return { cycle, issues: pickIssues(list, cycleHit), total: list.length, hit: cycleHit };
      })
      .filter((entry) => !searching || entry.hit || entry.issues.length > 0);
    const loose = looseByStage.get(stageKey) ?? [];
    return { contentCycles, loose: pickIssues(loose, ancestorHit), looseTotal: loose.length };
  };

  const subtreeVisible = new Map<string, boolean>();
  const isStageVisible = (stage: TProjectStage, ancestorHit: boolean): boolean => {
    if (!searching || ancestorHit) return true;
    const cached = subtreeVisible.get(stage.id);
    if (cached !== undefined) return cached;
    const selfHit = hitText(stage.name) || hitText(stage.code ?? "");
    const content = contentOf(stage.id, false);
    const value =
      selfHit ||
      content.contentCycles.length > 0 ||
      content.loose.length > 0 ||
      (childStages.get(stage.id) ?? []).some((child) => isStageVisible(child, false));
    subtreeVisible.set(stage.id, value);
    return value;
  };

  const rows: TPlanRow[] = [];
  const nodeExpanded = (id: string, byDefault: boolean) => (searching ? true : byDefault !== toggled.has(id));

  const pushIssues = (
    nodeId: string,
    list: TProjectStagePlanIssue[],
    depth: number,
    displayStageId: string | null,
    window: TPlanIssueRow["window"]
  ) => {
    const limited = searching || showAll.has(nodeId) ? list : list.slice(0, PLAN_NODE_ISSUE_LIMIT);
    for (const issue of limited) {
      const ownStageId = issue.stage_id && stageIds.has(issue.stage_id) ? issue.stage_id : null;
      rows.push({
        kind: "issue",
        id: `issue:${nodeId}:${issue.id}`,
        depth,
        hasToggle: false,
        expanded: false,
        issue,
        ownStageId: ownStageId && ownStageId !== displayStageId ? ownStageId : null,
        window,
      });
    }
    if (limited.length < list.length) {
      rows.push({ kind: "more", id: `more:${nodeId}`, nodeId, total: list.length, depth, hasToggle: false, expanded: false });
    }
  };

  /** 阶段或未关联组下面的迭代 + 不在迭代中 */
  const pushContent = (stageKey: string | null, depth: number, ancestorHit: boolean) => {
    const { contentCycles, loose } = contentOf(stageKey, ancestorHit);
    for (const { cycle, issues: cycleIssues, total } of contentCycles) {
      const id = cycleNodeId(cycle.id);
      const expanded = total > 0 && nodeExpanded(id, level === "issue");
      rows.push({
        kind: "cycle",
        id,
        depth,
        hasToggle: !searching && total > 0,
        expanded,
        cycle,
        issueCount: total,
        progress: progressOf(cycle.id),
      });
      if (expanded) {
        const window = cycle.start_date && cycle.end_date ? { start: cycle.start_date, end: cycle.end_date } : null;
        pushIssues(id, cycleIssues, depth + 1, stageKey, window);
      }
    }
    if (loose.length > 0) {
      const id = noCycleNodeId(stageKey);
      const expanded = nodeExpanded(id, level === "issue");
      rows.push({ kind: "nocycle", id, depth, hasToggle: !searching, expanded, issueCount: loose.length });
      if (expanded) pushIssues(id, loose, depth + 1, stageKey, null);
    }
  };

  const contentCounts = (stageKey: string | null) => {
    const stageCycles = cyclesByStage.get(stageKey) ?? [];
    const issueCount =
      stageCycles.reduce((sum, cycle) => sum + (issuesByCycle.get(cycle.id)?.length ?? 0), 0) +
      (looseByStage.get(stageKey)?.length ?? 0);
    return { cycleCount: stageCycles.length, issueCount };
  };

  const walk = (parentKey: string | null, depth: number, ancestorHit: boolean) => {
    for (const stage of childStages.get(parentKey) ?? []) {
      if (!isStageVisible(stage, ancestorHit)) continue;
      const selfHit = ancestorHit || (searching && (hitText(stage.name) || hitText(stage.code ?? "")));
      const children = childStages.get(stage.id) ?? [];
      const counts = contentCounts(stage.id);
      const hasContent = counts.cycleCount + counts.issueCount > 0;
      const id = planStageNodeId(stage.id);
      const hasToggle = !searching && (children.length > 0 || (level !== "stage" && hasContent));
      const expanded = nodeExpanded(id, true);
      const contentShown = expanded && level !== "stage";
      rows.push({
        kind: "stage",
        id,
        depth,
        hasToggle,
        expanded: hasToggle ? expanded : false,
        stage,
        hasChildStages: children.length > 0,
        ...counts,
        showCounts: hasContent && !contentShown,
      });
      if (!expanded) continue;
      walk(stage.id, depth + 1, selfHit);
      if (level !== "stage" || searching) pushContent(stage.id, depth + 1, selfHit);
    }
  };
  walk(null, 0, false);

  // 未关联阶段：没挂阶段的迭代 + 两边都没挂的工作项
  const orphan = contentOf(null, false);
  if (orphan.contentCycles.length > 0 || orphan.loose.length > 0) {
    const counts = contentCounts(null);
    const expanded = nodeExpanded(PLAN_GROUP_NODE_ID, true);
    const contentShown = expanded && level !== "stage";
    rows.push({
      kind: "group",
      id: PLAN_GROUP_NODE_ID,
      depth: 0,
      hasToggle: !searching && level !== "stage",
      expanded: contentShown,
      ...counts,
      showCounts: !contentShown,
    });
    if (contentShown || searching) pushContent(null, 1, false);
  }

  return rows;
};
