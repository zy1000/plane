import { useMemo } from "react";
import { E_SORT_ORDER } from "@plane/constants";
import { useLocalStorage } from "@plane/hooks";
import type { TStageReviewActivity, TStageReviewComment, TStageReviewDetail } from "@plane/types";

export type TStageReviewTimelineTab = "all" | "comments" | "trail";

export type TStageReviewTimelineItem =
  | { kind: "created"; key: string; at: string }
  | { kind: "comment"; key: string; at: string; comment: TStageReviewComment }
  | { kind: "activity"; key: string; at: string; activity: TStageReviewActivity };

// 与工作项活动区同一个口径：页签与排序记在本机，跨评审共用
const TAB_STORAGE_KEY = "stage_review_activity_tab";
const SORT_STORAGE_KEY = "stage_review_activity_sort";
const TABS: TStageReviewTimelineTab[] = ["all", "comments", "trail"];

/**
 * 轨迹里哪些记录进时间线：评论本身已经以卡片出现，「发表了评论」那条不再重复画，评论删了
 * 也不会留下孤儿；「创建」由前端按 detail.created_at 补一条（裁剪表生成的评审后端没写
 * 创建记录），后端手工新建的那条跳过，免得出现两条。
 */
const isTrailRecord = (activity: TStageReviewActivity) => activity.field !== "comment" && activity.verb !== "created";

const byTime = (a: TStageReviewTimelineItem, b: TStageReviewTimelineItem) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

/**
 * 详情抽屉「活动」区的数据：评论与轨迹合成一条按时间排的列表，带页签过滤和排序。
 *
 * 排序是稳定的：同一时刻的记录保持「创建 → 轨迹 → 评论」的原始先后。
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

  const { trailItems, commentItems } = useMemo(() => {
    const created: TStageReviewTimelineItem = { kind: "created", key: `created-${detail.id}`, at: detail.created_at };
    return {
      trailItems: [
        created,
        ...activities.filter(isTrailRecord).map(
          (activity): TStageReviewTimelineItem => ({
            kind: "activity",
            key: `activity-${activity.id}`,
            at: activity.created_at,
            activity,
          })
        ),
      ],
      commentItems: comments.map(
        (comment): TStageReviewTimelineItem => ({
          kind: "comment",
          key: `comment-${comment.id}`,
          at: comment.created_at,
          comment,
        })
      ),
    };
  }, [detail.id, detail.created_at, comments, activities]);

  const items = useMemo(() => {
    const picked =
      tab === "comments" ? commentItems : tab === "trail" ? trailItems : [...trailItems, ...commentItems];
    const sorted = [...picked].sort(byTime);
    return sortOrder === E_SORT_ORDER.DESC ? sorted.reverse() : sorted;
  }, [tab, sortOrder, trailItems, commentItems]);

  const counts: Record<TStageReviewTimelineTab, number> = {
    all: trailItems.length + commentItems.length,
    comments: commentItems.length,
    trail: trailItems.length,
  };

  const toggleSort = () => setSortOrder(sortOrder === E_SORT_ORDER.ASC ? E_SORT_ORDER.DESC : E_SORT_ORDER.ASC);

  return { items, counts, tab, setTab, sortOrder, toggleSort };
};
