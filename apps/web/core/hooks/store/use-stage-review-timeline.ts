import { useMemo } from "react";
import { E_SORT_ORDER } from "@plane/constants";
import { useLocalStorage } from "@plane/hooks";
import type { TStageReviewActivity, TStageReviewComment, TStageReviewDetail } from "@plane/types";
import { EStageReviewStatus } from "@plane/types";

/** 全部 / 状态推进 / 评论 / 修改轨迹 */
export type TStageReviewTimelineTab = "all" | "status" | "comments" | "edits";

/**
 * 时间线上的一行。`phaseBefore` / `phaseAfter` 是这一行上半段、下半段轨道所处的阶段 ——
 * 状态节点处两者不同，轨道在节点上换色；其余行两者相同。已按当前排序方向摆好，渲染直接用。
 */
export type TStageReviewTimelineRail = { phaseBefore: EStageReviewStatus | null; phaseAfter: EStageReviewStatus | null };

export type TStageReviewTimelineItem = TStageReviewTimelineRail &
  (
    | { kind: "created"; key: string; at: string }
    | { kind: "milestone"; key: string; at: string; activity: TStageReviewActivity }
    | { kind: "comment"; key: string; at: string; comment: TStageReviewComment }
    | { kind: "edits"; key: string; at: string; activities: TStageReviewActivity[] }
  );

// 与工作项活动区同一个口径：页签与排序记在本机，跨评审共用
const TAB_STORAGE_KEY = "stage_review_activity_tab";
const SORT_STORAGE_KEY = "stage_review_activity_sort";
const TABS: TStageReviewTimelineTab[] = ["all", "status", "comments", "edits"];

/** 同一个人连着改、相邻两条间隔不超过这么久，合成一条「修改了 N 项」 */
const EDIT_MERGE_WINDOW_MS = 10 * 60 * 1000;

const STATUSES = Object.values(EStageReviewStatus) as string[];
const asStatus = (value: string | null | undefined) =>
  value && STATUSES.includes(value) ? (value as EStageReviewStatus) : null;

/** 状态推进类：状态流转与「评审不通过」（结论事件，状态原地不动） */
export const isMilestoneActivity = (activity: TStageReviewActivity) =>
  activity.field === "status" || activity.field === "result";

/**
 * 轨迹里哪些记录进时间线：评论本身已经以气泡出现，「发表了评论」那条不再重复画；
 * 「创建」由前端按 detail.created_at 补一条（裁剪表生成的评审后端没写创建记录），
 * 后端手工新建的那条跳过，免得出现两条。
 */
const isTrailRecord = (activity: TStageReviewActivity) => activity.field !== "comment" && activity.verb !== "created";

type TRawItem =
  | { kind: "created"; key: string; at: string }
  | { kind: "milestone"; key: string; at: string; activity: TStageReviewActivity }
  | { kind: "comment"; key: string; at: string; comment: TStageReviewComment }
  | { kind: "edit"; key: string; at: string; activity: TStageReviewActivity };

const byTime = (a: { at: string }, b: { at: string }) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

type TMergedItem =
  | Exclude<TRawItem, { kind: "edit" }>
  | { kind: "edits"; key: string; at: string; activities: TStageReviewActivity[] };

/** 按时间正序合并相邻的修改：同一个人、中间没插别的行、相邻两条不超过窗口 */
const mergeEdits = (items: TRawItem[]) => {
  const merged: TMergedItem[] = [];
  for (const item of items) {
    if (item.kind !== "edit") {
      merged.push(item);
      continue;
    }
    const last = merged[merged.length - 1];
    if (last?.kind === "edits") {
      const prev = last.activities[last.activities.length - 1];
      const gap = new Date(item.at).getTime() - new Date(prev.created_at).getTime();
      if (prev.actor === item.activity.actor && gap <= EDIT_MERGE_WINDOW_MS) {
        last.activities.push(item.activity);
        continue;
      }
    }
    merged.push({ kind: "edits", key: item.key, at: item.at, activities: [item.activity] });
  }
  return merged;
};

/**
 * 详情抽屉「活动」区的数据：状态推进、评论、修改三类合成一条按时间排的列表。
 *
 * - 页签：全部 / 状态 / 评论 / 修改，计数按原始条数（合并前）。
 * - 阶段：沿时间正序走一遍状态记录，给每行标上所处阶段，轨道据此分段着色；
 *   「修改」页签只是一份字段清单，不着色。
 * - 排序是稳定的：同一时刻的记录保持「创建 → 轨迹 → 评论」的原始先后。
 */
export const useStageReviewTimeline = ({
  detail,
  comments,
  activities,
}: {
  detail: TStageReviewDetail;
  comments: TStageReviewComment[];
  activities: TStageReviewActivity[];
}) => {
  const { storedValue: storedTab, setValue: setTab } = useLocalStorage<TStageReviewTimelineTab>(TAB_STORAGE_KEY, "all");
  const { storedValue: storedSort, setValue: setSortOrder } = useLocalStorage<E_SORT_ORDER>(
    SORT_STORAGE_KEY,
    E_SORT_ORDER.ASC
  );
  const tab: TStageReviewTimelineTab = storedTab && TABS.includes(storedTab) ? storedTab : "all";
  const sortOrder = storedSort === E_SORT_ORDER.DESC ? E_SORT_ORDER.DESC : E_SORT_ORDER.ASC;

  const rawItems = useMemo(() => {
    const items: TRawItem[] = [
      { kind: "created", key: `created-${detail.id}`, at: detail.created_at },
      ...activities.filter(isTrailRecord).map(
        (activity): TRawItem => ({
          kind: isMilestoneActivity(activity) ? "milestone" : "edit",
          key: `activity-${activity.id}`,
          at: activity.created_at,
          activity,
        })
      ),
      ...comments.map(
        (comment): TRawItem => ({ kind: "comment", key: `comment-${comment.id}`, at: comment.created_at, comment })
      ),
    ];
    return items.sort(byTime);
  }, [detail.id, detail.created_at, comments, activities]);

  /** 每行所处阶段：沿完整列表正序走一遍状态流转，页签过滤后阶段照样对 */
  const phaseByKey = useMemo(() => {
    const firstStatus = rawItems.find((item) => item.kind === "milestone" && item.activity.field === "status");
    let phase =
      (firstStatus?.kind === "milestone" ? asStatus(firstStatus.activity.old_value) : null) ?? asStatus(detail.status);
    const map = new Map<string, TStageReviewTimelineRail>();
    for (const item of rawItems) {
      const before = phase;
      if (item.kind === "milestone" && item.activity.field === "status") {
        phase = asStatus(item.activity.new_value) ?? phase;
      }
      map.set(item.key, { phaseBefore: before, phaseAfter: phase });
    }
    return map;
  }, [rawItems, detail.status]);

  const items = useMemo(() => {
    const picked = rawItems.filter((item) => {
      if (tab === "status") return item.kind === "created" || item.kind === "milestone";
      if (tab === "comments") return item.kind === "comment";
      if (tab === "edits") return item.kind === "edit";
      return true;
    });
    const colored = tab !== "edits";

    // 合并组沿用组内第一条的 key，阶段也取它的
    const withRail = mergeEdits(picked).map((item): TStageReviewTimelineItem => {
      const rail = colored ? phaseByKey.get(item.key) : undefined;
      return { ...item, phaseBefore: rail?.phaseBefore ?? null, phaseAfter: rail?.phaseAfter ?? null };
    });

    if (sortOrder === E_SORT_ORDER.ASC) return withRail;
    // 倒序时轨道也倒过来：上半段是变化之后，下半段是变化之前
    return withRail
      .reverse()
      .map((item) => ({ ...item, phaseBefore: item.phaseAfter, phaseAfter: item.phaseBefore }));
  }, [rawItems, phaseByKey, tab, sortOrder]);

  const counts = useMemo(() => {
    const result: Record<TStageReviewTimelineTab, number> = { all: rawItems.length, status: 0, comments: 0, edits: 0 };
    for (const item of rawItems) {
      if (item.kind === "comment") result.comments += 1;
      else if (item.kind === "edit") result.edits += 1;
      else result.status += 1;
    }
    return result;
  }, [rawItems]);

  const toggleSort = () => setSortOrder(sortOrder === E_SORT_ORDER.ASC ? E_SORT_ORDER.DESC : E_SORT_ORDER.ASC);

  return { items, counts, tab, setTab, sortOrder, toggleSort };
};
