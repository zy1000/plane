"use client";

import React, { useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { E_SORT_ORDER } from "@plane/constants";
import type { TTestCaseActivity, TTestCaseComment } from "@plane/types";
import { cn } from "@plane/utils";
import { ActivitySortRoot } from "@/components/issues/issue-detail/issue-activity/sort-root";
import { ActivityFeedCollapsible } from "@/components/issues/issue-detail/issue-activity/activity-feed-collapsible";
import { useTestCaseActivity } from "@/hooks/store/use-test-case-activity";
import { useTestCaseComment } from "@/hooks/store/use-test-case-comment";
import { TestCaseActivityFeed } from "./test-case-activity-feed";
import { TestCaseCommentsSection } from "../test-case-comments/test-case-comments-section";

type SubTabKey = "all" | "activity" | "comment" | "transition";

type Props = {
  workspaceSlug: string;
  projectId: string;
  caseId: string;
};

const SECTION_CARD = "rounded-xl bg-surface-1";
const FEED_COLLAPSED_MAX_HEIGHT_PX = 560;

const SUB_TABS: { key: SubTabKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "activity", label: "活动" },
  { key: "comment", label: "评论" },
  { key: "transition", label: "转换" },
];

/** 「转换」子页签展示评审状态和执行情况的变更 */
const TRANSITION_FIELDS = new Set(["review", "execution"]);
/** 「活动」子页签排除评论和转换 */
const isActivityField = (field: string | null) =>
  field !== "comment" && !TRANSITION_FIELDS.has(field ?? "");

const toTimestamp = (value: string): number => new Date(value).getTime();

const flattenComments = (comments: TTestCaseComment[]): TTestCaseComment[] => {
  const flattened: TTestCaseComment[] = [];
  const visited = new Set<string>();
  const stack = [...comments];

  while (stack.length > 0) {
    const current = stack.pop() as TTestCaseComment;
    if (!current?.id || visited.has(current.id)) continue;
    visited.add(current.id);
    flattened.push(current);

    if (Array.isArray(current.children) && current.children.length > 0) {
      for (let i = current.children.length - 1; i >= 0; i--) {
        stack.push(current.children[i] as TTestCaseComment);
      }
    }
  }

  return flattened.sort((a, b) => toTimestamp(a.created_at) - toTimestamp(b.created_at));
};

export const TestCaseActivityTab: React.FC<Props> = observer(({ workspaceSlug, projectId, caseId }) => {
  const [active, setActive] = useState<SubTabKey>("all");
  const [sortOrder, setSortOrder] = useState<E_SORT_ORDER>(E_SORT_ORDER.ASC);

  const { getActivitiesByCaseId, fetchActivities } = useTestCaseActivity();
  const allActivities = getActivitiesByCaseId(caseId);
  const { getCommentsByCaseId, fetchComments } = useTestCaseComment();
  const comments = getCommentsByCaseId(caseId);

  useSWR(
    workspaceSlug && caseId ? ["test-case-comments-for-activity-tab", workspaceSlug, caseId] : null,
    () => fetchComments(workspaceSlug, caseId)
  );

  const allTabActivities = useMemo<TTestCaseActivity[]>(() => {
    const nonCommentActivities = allActivities.filter((activity) => activity.field !== "comment");
    const flatComments = flattenComments(comments);
    const commentsById = new Map(flatComments.map((comment) => [comment.id, comment]));
    const commentActivities: TTestCaseActivity[] = flatComments.map((comment) => {
      const parentComment = comment.parent ? commentsById.get(comment.parent) : undefined;
      return {
        id: `comment-${comment.id}`,
        case: comment.case,
        actor: comment.creator ?? null,
        actor_detail: comment.actor_detail,
        verb: "created",
        field: "comment",
        old_value: null,
        new_value: comment.comment_stripped || null,
        old_identifier: null,
        new_identifier: comment.id,
        comment: comment.comment_stripped ? `评论：${comment.comment_stripped}` : "新增了评论",
        test_case_comment: comment.id,
        epoch: null,
        extra: {
          comment_html: comment.comment_html ?? "",
          reply_to_actor: parentComment?.creator ?? null,
          reply_to_name: parentComment?.actor_detail?.display_name ?? null,
        },
        created_at: comment.created_at,
        updated_at: comment.updated_at,
      };
    });
    return [...nonCommentActivities, ...commentActivities].sort(
      (a, b) => toTimestamp(a.created_at) - toTimestamp(b.created_at)
    );
  }, [allActivities, comments]);

  const filterFn = useMemo(() => {
    if (active === "all") return undefined;
    if (active === "activity")
      return (activity: TTestCaseActivity) => isActivityField(activity.field);
    if (active === "comment")
      return undefined; // comment tab uses CommentsSection, not feed
    if (active === "transition")
      return (activity: TTestCaseActivity) => TRANSITION_FIELDS.has(activity.field ?? "");
    return undefined;
  }, [active]);

  const feedSource = active === "all" ? allTabActivities : allActivities;
  const feedListLength = filterFn ? feedSource.filter(filterFn).length : feedSource.length;
  const isFeedTab = active !== "comment";

  const toggleSortOrder = () =>
    setSortOrder((prev) => (prev === E_SORT_ORDER.ASC ? E_SORT_ORDER.DESC : E_SORT_ORDER.ASC));

  return (
    <section className={`${SECTION_CARD} flex min-h-[440px] flex-col`}>
      <div className="flex items-center justify-between gap-2 border-b border-subtle px-5">
        <div className="flex items-center gap-1" role="tablist" aria-label="用例动态筛选">
          {SUB_TABS.map((tab) => {
            const isTabActive = tab.key === active;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isTabActive}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1 border-b-2 px-2 py-2.5 text-14 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-primary",
                  isTabActive
                    ? "border-accent-primary text-primary"
                    : "border-transparent text-placeholder hover:text-secondary"
                )}
                onClick={() => setActive(tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {isFeedTab && (
          <div className="flex shrink-0 items-center gap-2">
            <ActivitySortRoot sortOrder={sortOrder} toggleSort={toggleSortOrder} />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {active === "comment" ? (
          <TestCaseCommentsSection workspaceSlug={workspaceSlug} projectId={projectId} caseId={caseId} />
        ) : (
          <div className="px-6 py-5">
            <ActivityFeedCollapsible
              resetKey={`${caseId}:${active}:${sortOrder}`}
              listLength={feedListLength}
              maxHeightPx={FEED_COLLAPSED_MAX_HEIGHT_PX}
            >
              <TestCaseActivityFeed
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                caseId={caseId}
                activities={active === "all" ? allTabActivities : undefined}
                filterFn={filterFn}
                sortOrder={sortOrder}
                emptyHint={
                  active === "activity"
                    ? "暂无活动记录"
                    : active === "transition"
                      ? "暂无状态转换记录"
                      : "暂无动态"
                }
              />
            </ActivityFeedCollapsible>
          </div>
        )}
      </div>
    </section>
  );
});
