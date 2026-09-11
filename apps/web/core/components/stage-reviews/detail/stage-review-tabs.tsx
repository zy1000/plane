import { useState } from "react";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewActivity, TStageReviewComment } from "@plane/types";
import { cn } from "@plane/utils";
import { StageReviewActivityFeed } from "./stage-review-activity";
import { StageReviewComments } from "./stage-review-comments";

const I18N = "stage_review";

/**
 * 讨论与轨迹合成一组 Tab。
 *
 * 两者是同一件事的两面 ——「谁说了什么」和「谁推进了什么」，并排成两块只会把抽屉拉得
 * 更长，而且读的人一次只关心其中一个。
 */
export const StageReviewTabs = ({
  reviewId,
  workspaceSlug,
  workspaceId,
  projectId,
  comments,
  activities,
  isMutating,
  onCreateComment,
  onDeleteComment,
}: {
  reviewId: string;
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
  const [tab, setTab] = useState<"discussion" | "trail">("discussion");

  const tabs = [
    { key: "discussion" as const, label: t(`${I18N}.detail.tab_discussion`), count: comments.length },
    { key: "trail" as const, label: t(`${I18N}.detail.tab_trail`), count: activities.length },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex gap-5 border-b border-subtle">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 border-transparent pb-2 text-13 text-tertiary transition",
              "hover:text-secondary",
              tab === item.key && "border-accent-strong font-semibold text-primary"
            )}
          >
            {item.label}
            <span className="text-12 tabular-nums text-placeholder">{item.count}</span>
          </button>
        ))}
      </div>

      {tab === "discussion" ? (
        <StageReviewComments
          comments={comments}
          reviewId={reviewId}
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          projectId={projectId}
          isMutating={isMutating}
          onCreate={onCreateComment}
          onDelete={onDeleteComment}
        />
      ) : (
        <StageReviewActivityFeed activities={activities} />
      )}
    </section>
  );
};
