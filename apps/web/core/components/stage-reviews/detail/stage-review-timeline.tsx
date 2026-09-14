import { ArrowDownWideNarrow, ArrowUpWideNarrow } from "lucide-react";
import { E_SORT_ORDER } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import type { TStageReviewActivity, TStageReviewComment, TStageReviewDetail } from "@plane/types";
import { Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TStageReviewTimelineTab } from "@/hooks/store/use-stage-review-timeline";
import { useStageReviewTimeline } from "@/hooks/store/use-stage-review-timeline";
import { useUser } from "@/hooks/store/user";
import { StageReviewActivityRow, StageReviewCreatedRow } from "./stage-review-activity";
import { StageReviewCommentCard, StageReviewCommentComposer } from "./stage-review-comments";

const I18N = "stage_review";

const TABS: { key: TStageReviewTimelineTab; label: string; empty: string }[] = [
  { key: "all", label: "tab_all", empty: "no_timeline" },
  { key: "comments", label: "tab_comments", empty: "no_comments" },
  { key: "trail", label: "tab_trail", empty: "no_activity" },
];

/**
 * 活动时间线：评论与变更记录按时间穿插在同一条竖线上，与工作项详情的活动区同一个结构。
 *
 * 顶部切换 全部 / 评论 / 轨迹，右侧排序按钮；评论输入框跟着排序走 —— 从旧到新时在底部
 * （接着最新那条往下写），从新到旧时在顶部。只看轨迹时不出输入框。
 */
export const StageReviewTimeline = ({
  detail,
  workspaceSlug,
  workspaceId,
  projectId,
  comments,
  activities,
  isMutating,
  onCreateComment,
  onDeleteComment,
}: {
  detail: TStageReviewDetail;
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  comments: TStageReviewComment[];
  activities: TStageReviewActivity[];
  isMutating: boolean;
  onCreateComment: (commentHtml: string) => Promise<unknown>;
  onDeleteComment: (commentId: string) => Promise<unknown>;
}) => {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { items, counts, tab, setTab, sortOrder, toggleSort } = useStageReviewTimeline({
    detail,
    comments,
    activities,
  });
  const isDesc = sortOrder === E_SORT_ORDER.DESC;
  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0];

  const composer = tab !== "trail" && (
    <StageReviewCommentComposer
      reviewId={detail.id}
      workspaceSlug={workspaceSlug}
      workspaceId={workspaceId}
      projectId={projectId}
      isMutating={isMutating}
      onCreate={onCreateComment}
    />
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 border-b border-subtle pb-2">
        <h4 className="text-14 font-semibold text-primary">{t(`${I18N}.detail.timeline_title`)}</h4>
        <div className="ml-auto flex items-center gap-1">
          {TABS.map((item) => {
            const isActive = item.key === tab;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-13 transition",
                  isActive ? "bg-layer-2 font-medium text-primary" : "text-tertiary hover:bg-layer-1 hover:text-secondary"
                )}
              >
                {t(`${I18N}.detail.${item.label}`)}
                <span className={cn("text-12 tabular-nums", isActive ? "text-secondary" : "text-placeholder")}>
                  {counts[item.key]}
                </span>
              </button>
            );
          })}
          <span className="mx-1 h-4 w-px bg-layer-3" aria-hidden />
          <Tooltip tooltipContent={t(`${I18N}.detail.${isDesc ? "sort_desc" : "sort_asc"}`)}>
            <IconButton
              variant="tertiary"
              icon={isDesc ? ArrowDownWideNarrow : ArrowUpWideNarrow}
              onClick={toggleSort}
              aria-label={t(`${I18N}.detail.${isDesc ? "sort_desc" : "sort_asc"}`)}
            />
          </Tooltip>
        </div>
      </div>

      {isDesc && composer}

      {items.length === 0 ? (
        <p className="py-2 text-13 text-placeholder">{t(`${I18N}.detail.${activeTab.empty}`)}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => {
            if (item.kind === "created") return <StageReviewCreatedRow key={item.key} detail={detail} />;
            if (item.kind === "comment") {
              return (
                <StageReviewCommentCard
                  key={item.key}
                  comment={item.comment}
                  leaderId={detail.leader_id}
                  auditorId={detail.auditor_id}
                  currentUserId={currentUser?.id}
                  onDelete={(commentId) => void onDeleteComment(commentId)}
                />
              );
            }
            return <StageReviewActivityRow key={item.key} activity={item.activity} />;
          })}
        </ul>
      )}

      {!isDesc && composer}
    </section>
  );
};
