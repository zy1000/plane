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
import { StageReviewCreatedRow, StageReviewMilestoneRow } from "./stage-review-activity";
import { StageReviewCommentCard, StageReviewCommentComposer } from "./stage-review-comments";
import { StageReviewEditRow } from "./stage-review-edit-row";

const I18N = "stage_review";

/** 页签前的小点与三类记录的节点颜色对应：状态蓝、评论绿、修改灰 */
const TABS: { key: TStageReviewTimelineTab; label: string; empty: string; dot?: string }[] = [
  { key: "all", label: "tab_all", empty: "no_timeline" },
  { key: "status", label: "tab_status", empty: "no_status", dot: "bg-accent-primary" },
  { key: "comments", label: "tab_comments", empty: "no_comments", dot: "bg-success-primary" },
  { key: "edits", label: "tab_edits", empty: "no_activity", dot: "bg-(--text-color-placeholder)" },
];

/**
 * 活动时间线：状态推进、评论、修改轨迹三类记录按时间穿插在一条轨道上，三类三种视觉重量 ——
 * 状态是彩色圆节点、评论是头像 + 气泡、修改是灰点一行字；轨道随阶段分段着色。
 *
 * 顶部切换 全部 / 状态 / 评论 / 修改，右侧排序按钮；评论输入框跟着排序走 —— 从旧到新时在底部
 * （接着最新那条往下写），从新到旧时在顶部。只看状态或修改时不出输入框。
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

  const composer = (tab === "all" || tab === "comments") && (
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
      <div className="flex flex-wrap items-center gap-2 border-b border-subtle pb-2.5">
        <h4 className="text-14 font-semibold text-primary">{t(`${I18N}.detail.timeline_title`)}</h4>
        <span className="text-12 text-placeholder tabular-nums">{counts.all}</span>
        <div className="ml-auto flex items-center gap-1.5">
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
                    "flex h-6.5 items-center gap-1.5 rounded-md px-2.5 text-13 transition",
                    isActive
                      ? "bg-surface-1 font-medium text-primary shadow-raised-100"
                      : "text-tertiary hover:text-secondary"
                  )}
                >
                  {item.dot && <span className={cn("size-1.5 shrink-0 rounded-full", item.dot)} aria-hidden />}
                  {t(`${I18N}.detail.${item.label}`)}
                  <span className={cn("text-12 tabular-nums", isActive ? "text-secondary" : "text-placeholder")}>
                    {counts[item.key]}
                  </span>
                </button>
              );
            })}
          </div>
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
          {items.map((item, index) => {
            const position = {
              rail: { phaseBefore: item.phaseBefore, phaseAfter: item.phaseAfter },
              isFirst: index === 0,
              isLast: index === items.length - 1,
            };
            if (item.kind === "created") {
              return <StageReviewCreatedRow key={item.key} detail={detail} position={position} />;
            }
            if (item.kind === "milestone") {
              return <StageReviewMilestoneRow key={item.key} activity={item.activity} position={position} />;
            }
            if (item.kind === "edits") {
              return <StageReviewEditRow key={item.key} activities={item.activities} position={position} />;
            }
            return (
              <StageReviewCommentCard
                key={item.key}
                comment={item.comment}
                position={position}
                leaderId={detail.leader_id}
                auditorId={detail.auditor_id}
                currentUserId={currentUser?.id}
                onDelete={(commentId) => void onDeleteComment(commentId)}
              />
            );
          })}
        </ul>
      )}

      {!isDesc && composer}
    </section>
  );
};
