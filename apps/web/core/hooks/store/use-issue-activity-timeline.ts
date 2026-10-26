import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { E_SORT_ORDER, EActivityTab, TRANSITION_ACTIVITY_FIELDS } from "@plane/constants";
import type { TIssueActivity, TIssueComment } from "@plane/types";
import { useIssueDetail } from "./use-issue-detail";

/**
 * 工作项活动时间线上的一行。
 * - created：创建节点，`initial` 是同一次请求里一起写进去的初始属性（负责人、标签…），挂在创建行下面而不是各占一行
 * - transition：状态流转 / 审批 / 归档 / 收件箱 / 删除，彩色节点
 * - comment：评论，头像坐轨道 + 气泡
 * - edits：同一个人连着改的属性，合成一条「修改了 N 项」
 */
export type TIssueTimelineItem =
  | { kind: "created"; key: string; at: string; activity: TIssueActivity; initial: TIssueActivity[] }
  | { kind: "transition"; key: string; at: string; activity: TIssueActivity }
  | { kind: "comment"; key: string; at: string; comment: TIssueComment }
  | { kind: "edits"; key: string; at: string; activities: TIssueActivity[] };

/** 按本地日期分组：`date` 是 yyyy-MM-dd */
export type TIssueTimelineDay = { date: string; items: TIssueTimelineItem[] };

export type TIssueTimelineCounts = Record<
  EActivityTab.TRANSITION | EActivityTab.COMMENT | EActivityTab.EDITS,
  number
>;

/** 同一个人连着改、相邻两条间隔不超过这么久，合成一条 */
const EDIT_MERGE_WINDOW_MS = 10 * 60 * 1000;

export const isCreatedActivity = (activity: TIssueActivity) => !activity.field && activity.verb === "created";

/** 状态 / 审批 / 归档 / 收件箱，以及没有 field 的「删除」记录 */
export const isTransitionActivity = (activity: TIssueActivity) =>
  activity.field ? TRANSITION_ACTIVITY_FIELDS.includes(activity.field) || activity.field === "issue" : !isCreatedActivity(activity);

type TRawItem =
  | { kind: "created"; key: string; at: string; activity: TIssueActivity; initial: TIssueActivity[] }
  | { kind: "transition"; key: string; at: string; activity: TIssueActivity }
  | { kind: "comment"; key: string; at: string; comment: TIssueComment }
  | { kind: "edit"; key: string; at: string; activity: TIssueActivity };

const actorIds = (item: { actor?: string; actor_detail?: { id?: string }; created_by?: string; updated_by?: string }) =>
  [item.actor, item.actor_detail?.id, item.created_by, item.updated_by].filter((id): id is string => !!id);

const toDayKey = (iso: string) => {
  const parsed = parseISO(iso);
  return Number.isNaN(parsed.getTime()) ? iso.slice(0, 10) : format(parsed, "yyyy-MM-dd");
};

/**
 * 创建时一起写入的属性（同一 epoch、同一人）并进创建行；其余按「同一人、中间没插别的行、相邻不超过窗口」合并。
 */
const mergeItems = (items: TRawItem[]): TIssueTimelineItem[] => {
  const merged: TIssueTimelineItem[] = [];
  for (const item of items) {
    if (item.kind !== "edit") {
      merged.push(item);
      continue;
    }
    const last = merged[merged.length - 1];
    if (
      last?.kind === "created" &&
      last.activity.epoch === item.activity.epoch &&
      last.activity.actor === item.activity.actor
    ) {
      last.initial.push(item.activity);
      continue;
    }
    if (last?.kind === "edits") {
      const prev = last.activities[last.activities.length - 1];
      const gap = new Date(item.at).getTime() - new Date(prev.created_at).getTime();
      if (prev.actor === item.activity.actor && (prev.epoch === item.activity.epoch || gap <= EDIT_MERGE_WINDOW_MS)) {
        last.activities.push(item.activity);
        continue;
      }
    }
    merged.push({ kind: "edits", key: item.key, at: item.at, activities: [item.activity] });
  }
  return merged;
};

const matchesTab = (item: TIssueTimelineItem, tab: EActivityTab) => {
  if (tab === EActivityTab.ALL) return true;
  if (tab === EActivityTab.TRANSITION) return item.kind === "transition";
  if (tab === EActivityTab.COMMENT) return item.kind === "comment";
  if (tab === EActivityTab.EDITS) return item.kind === "edits";
  return false;
};

/**
 * 工作项详情「活动」区的数据：把 store 里的活动与评论按时间排成一条线，合并连续修改，再按天分组。
 * 页签计数按合并后的行数算，和页签里看到的行一一对应。
 */
export const useIssueActivityTimeline = ({
  issueId,
  activeTab,
  sortOrder,
  operatorFilterIds,
}: {
  issueId: string;
  activeTab: EActivityTab;
  sortOrder: E_SORT_ORDER;
  operatorFilterIds: string[];
}) => {
  const {
    activity: { getActivityAndCommentsByIssueId, getActivityById },
    comment: { getCommentById },
  } = useIssueDetail();

  const ordered = getActivityAndCommentsByIssueId(issueId, E_SORT_ORDER.ASC);

  const { rawItems, operatorIds } = useMemo(() => {
    const items: TRawItem[] = [];
    const operators = new Set<string>();
    ordered?.forEach((entry) => {
      if (entry.activity_type === "COMMENT") {
        const comment = getCommentById(entry.id);
        if (!comment) return;
        actorIds(comment).forEach((id) => operators.add(id));
        items.push({ kind: "comment", key: `comment-${comment.id}`, at: comment.created_at, comment });
        return;
      }
      const activity = getActivityById(entry.id);
      if (!activity) return;
      actorIds(activity).forEach((id) => operators.add(id));
      const key = `activity-${activity.id}`;
      if (isCreatedActivity(activity)) {
        items.push({ kind: "created", key, at: activity.created_at, activity, initial: [] });
      } else if (isTransitionActivity(activity)) {
        items.push({ kind: "transition", key, at: activity.created_at, activity });
      } else {
        items.push({ kind: "edit", key, at: activity.created_at, activity });
      }
    });
    return { rawItems: items, operatorIds: Array.from(operators) };
  }, [ordered, getActivityById, getCommentById]);

  const merged = useMemo(() => {
    const selected = new Set(operatorFilterIds);
    const filtered =
      selected.size === 0
        ? rawItems
        : rawItems.filter((item) => {
            const source = item.kind === "comment" ? item.comment : item.activity;
            return actorIds(source).some((id) => selected.has(id));
          });
    return mergeItems(filtered);
  }, [rawItems, operatorFilterIds]);

  const counts = useMemo<TIssueTimelineCounts>(() => {
    const result: TIssueTimelineCounts = {
      [EActivityTab.TRANSITION]: 0,
      [EActivityTab.COMMENT]: 0,
      [EActivityTab.EDITS]: 0,
    };
    merged.forEach((item) => {
      if (item.kind === "transition") result[EActivityTab.TRANSITION] += 1;
      else if (item.kind === "comment") result[EActivityTab.COMMENT] += 1;
      else if (item.kind === "edits") result[EActivityTab.EDITS] += 1;
    });
    return result;
  }, [merged]);

  const days = useMemo<TIssueTimelineDay[]>(() => {
    const visible = merged.filter((item) => matchesTab(item, activeTab));
    if (sortOrder === E_SORT_ORDER.DESC) visible.reverse();
    const groups: TIssueTimelineDay[] = [];
    visible.forEach((item) => {
      const date = toDayKey(item.at);
      const last = groups[groups.length - 1];
      if (last && last.date === date) last.items.push(item);
      else groups.push({ date, items: [item] });
    });
    return groups;
  }, [merged, activeTab, sortOrder]);

  return { days, counts, operatorIds, isLoading: ordered === undefined };
};
