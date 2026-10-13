import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import type { TRiskActivity, TRiskComment, TRiskLinkedIssue } from "@plane/types";
import { cn } from "@plane/utils";
import { Block, EmptyLine } from "../../stage-reviews/detail/stage-review-content";
import { RISK_I18N } from "../constants";
import { RiskCommentCard, RiskCommentComposer } from "./risk-comments";
import { RiskActivityRow } from "./risk-timeline";

type TTab = "all" | "comments" | "history";

const TABS: { key: TTab; label: string; empty: string }[] = [
  { key: "all", label: "activity_all", empty: "no_activity" },
  { key: "comments", label: "activity_comments", empty: "no_comments" },
  { key: "history", label: "activity_history", empty: "no_history" },
];

type TItem =
  | { kind: "activity"; key: string; at: string; activity: TRiskActivity }
  | { kind: "comment"; key: string; at: string; comment: TRiskComment };

const byTime = (a: { at: string }, b: { at: string }) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

/**
 * 活动区：评论与变更历史按时间穿插在一条轨道上，从旧到新；页签 全部 / 评论 / 变更历史 带计数，
 * 评论输入框固定在底部（接着最新那条往下写）。只看变更历史、或访客，不出输入框。
 *
 * 评论本身已经以气泡出现，轨迹里「发表了评论」那条不再重复画。
 */
export const RiskActivity = ({
  riskId,
  workspaceSlug,
  workspaceId,
  projectId,
  issues,
  comments,
  activities,
  editable,
  isMutating,
  currentUserId,
  onCreateComment,
  onDeleteComment,
}: {
  riskId: string;
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  issues: TRiskLinkedIssue[];
  comments: TRiskComment[];
  activities: TRiskActivity[];
  editable: boolean;
  isMutating: boolean;
  currentUserId: string | undefined;
  onCreateComment: (commentHtml: string) => Promise<unknown>;
  onDeleteComment: (commentId: string) => void;
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TTab>("all");

  // 抽屉里换到另一条风险时组件不一定重挂：换了就回到「全部」
  useEffect(() => setTab("all"), [riskId]);

  const { items, counts } = useMemo(() => {
    const history = activities
      .filter((activity) => activity.field !== "comment")
      .map((activity): TItem => ({ kind: "activity", key: `a-${activity.id}`, at: activity.created_at, activity }));
    const bubbles = comments.map(
      (comment): TItem => ({ kind: "comment", key: `c-${comment.id}`, at: comment.created_at, comment })
    );
    const all = [...history, ...bubbles].sort(byTime);
    return {
      items: { all, comments: bubbles.sort(byTime), history: history.sort(byTime) } as Record<TTab, TItem[]>,
      counts: { all: all.length, comments: bubbles.length, history: history.length } as Record<TTab, number>,
    };
  }, [activities, comments]);

  const shown = items[tab];
  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0];

  const tabs = (
    <div className="flex items-center gap-0.5 rounded-lg bg-layer-1 p-0.5" role="tablist">
      {TABS.map((item) => {
        const isActive = item.key === tab;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setTab(item.key)}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-md px-2 text-13 transition",
              isActive ? "bg-surface-1 font-medium text-primary shadow-raised-100" : "text-tertiary hover:text-secondary"
            )}
          >
            {t(`${RISK_I18N}.detail.${item.label}`)}
            <span className={cn("text-12 tabular-nums", isActive ? "text-secondary" : "text-placeholder")}>
              {counts[item.key]}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <Block title={t(`${RISK_I18N}.detail.activity`)} count={counts.all} action={tabs}>
      {shown.length === 0 ? (
        <EmptyLine text={t(`${RISK_I18N}.detail.${activeTab.empty}`)} />
      ) : (
        <ul className="flex flex-col">
          {shown.map((item, index) =>
            item.kind === "activity" ? (
              <RiskActivityRow
                key={item.key}
                activity={item.activity}
                issues={issues}
                isFirst={index === 0}
                isLast={index === shown.length - 1}
              />
            ) : (
              <RiskCommentCard
                key={item.key}
                comment={item.comment}
                isFirst={index === 0}
                isLast={index === shown.length - 1}
                workspaceSlug={workspaceSlug}
                workspaceId={workspaceId}
                projectId={projectId}
                currentUserId={currentUserId}
                onDelete={onDeleteComment}
              />
            )
          )}
        </ul>
      )}

      {editable && tab !== "history" && (
        <RiskCommentComposer
          riskId={riskId}
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          projectId={projectId}
          isMutating={isMutating}
          onCreate={onCreateComment}
        />
      )}
    </Block>
  );
};
