import type { TReviewTailoringActivity } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";

/** 变更历史的筛选：全部 / 状态推进 / 修改 */
export type TTimelineFilter = "all" | "status" | "edits";

/**
 * 时间线上的一条：
 * - `milestone`：状态推进（建表、提交、通过、驳回、撤回、修订），彩色节点；
 * - `cells`：同一个人一次保存下来的格子改动，合成一条可展开；
 * - `edit`：其余修改（加减轴、改标题描述、同步矩阵），一句灰字。
 *
 * `phaseBefore / phaseAfter` 是这一条前后表所处的状态，轨道按它着色。
 */
export type TTimelineEntry = {
  key: string;
  kind: "milestone" | "cells" | "edit";
  activities: TReviewTailoringActivity[];
  phaseBefore: EReviewTailoringStatus;
  phaseAfter: EReviewTailoringStatus;
};

const CELL_FIELDS = ["cell_selected", "cell_reason"];
/** 一次保存的记录在同一个事务里连续写入，相邻两条间隔超过这个数就当作另一次保存 */
const SAVE_GAP_MS = 60 * 1000;

const STATUSES = Object.values(EReviewTailoringStatus) as string[];
const asStatus = (value: string | null) =>
  value && STATUSES.includes(value) ? (value as EReviewTailoringStatus) : null;

export const isMilestone = (activity: TReviewTailoringActivity) =>
  activity.field === "status" || activity.field === "tailoring" || activity.field === "approval";

const isCell = (activity: TReviewTailoringActivity) => CELL_FIELDS.includes(activity.field ?? "");

/** 活动按时间正序到达；这里只分组、算轨道，不排序 */
export const buildTailoringTimeline = (activities: TReviewTailoringActivity[]): TTimelineEntry[] => {
  const entries: TTimelineEntry[] = [];
  let phase = EReviewTailoringStatus.DRAFT;

  for (const activity of activities) {
    const before = phase;
    if (activity.field === "status") phase = asStatus(activity.new_value) ?? phase;

    const previous = entries[entries.length - 1];
    const previousLast = previous?.activities[previous.activities.length - 1];
    if (
      isCell(activity) &&
      previous?.kind === "cells" &&
      previousLast?.actor === activity.actor &&
      Math.abs(new Date(activity.created_at).getTime() - new Date(previousLast.created_at).getTime()) <= SAVE_GAP_MS
    ) {
      previous.activities.push(activity);
      continue;
    }

    entries.push({
      key: activity.id,
      kind: isMilestone(activity) ? "milestone" : isCell(activity) ? "cells" : "edit",
      activities: [activity],
      phaseBefore: before,
      phaseAfter: phase,
    });
  }
  return entries;
};

export const filterTimeline = (entries: TTimelineEntry[], filter: TTimelineFilter) =>
  filter === "all"
    ? entries
    : entries.filter((entry) => (filter === "status" ? entry.kind === "milestone" : entry.kind !== "milestone"));

/** 分段筛选上的条数按原始记录数算，与页签上的总数对得上 */
export const countTimeline = (activities: TReviewTailoringActivity[]) => {
  const status = activities.filter(isMilestone).length;
  return { all: activities.length, status, edits: activities.length - status };
};
