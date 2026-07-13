import { useRef } from "react";
import { observer } from "mobx-react";
import { Check, CircleHelp, Layers3, X } from "lucide-react";
import type { EditorRefApi } from "@plane/editor";
import { CommentReplyIcon } from "@plane/propel/icons";
import { Avatar, Tooltip } from "@plane/ui";
import { calculateTimeAgo, getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { LiteTextEditor } from "@/components/editor/lite-text";
import { getUserAvatarFallbackBackgroundColor } from "@/helpers/user-avatar.helper";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import type { TRequirementReviewOpinion } from "@/services/requirement.service";
import type { TRequirementActivityItem } from "./requirement-activity-utils";

const opinionMeta: Record<TRequirementReviewOpinion, { label: string; icon: typeof Check; className: string }> = {
  approved: { label: "通过", icon: Check, className: "text-green-700 dark:text-green-300" },
  rejected: { label: "拒绝", icon: X, className: "text-red-700 dark:text-red-300" },
  needs_clarification: {
    label: "有待明确",
    icon: CircleHelp,
    className: "text-yellow-700 dark:text-yellow-300",
  },
};

type Props = {
  items: TRequirementActivityItem[];
  workspaceSlug: string;
  workspaceId: string;
  onOpenReview: (changeId: string) => void;
};

export const RequirementActivityFeed = observer(function RequirementActivityFeed(props: Props) {
  const { items, workspaceSlug, workspaceId, onOpenReview } = props;
  const { getUserDetails } = useMember();
  const { data: currentUser } = useUser();

  const actorName = (actor: string | null, fallback?: { display_name?: string } | null) => {
    if (!actor) return "系统";
    if (currentUser?.id === actor) return "你";
    return getUserDetails(actor)?.display_name ?? fallback?.display_name ?? "未知用户";
  };

  return (
    <ul role="list" className="relative">
      {items.map((item) => {
        if (item.activityType === "comment") {
          return (
            <RequirementActivityComment
              key={item.id}
              item={item}
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              displayName={actorName(item.actor, item.actorDetail)}
              replyTargetName={
                item.replyTarget ? actorName(item.replyTarget.actor, item.replyTarget.actor_detail) : null
              }
            />
          );
        }

        const reviewMeta = item.activityType === "review" ? opinionMeta[item.opinion] : undefined;
        const Icon = reviewMeta?.icon ?? Layers3;
        const displayName = actorName(item.actor, item.actorDetail);
        return (
          <li key={item.id} className="relative flex gap-3 py-2.5">
            <div className="absolute top-0 bottom-0 left-[13px] w-px bg-layer-3" aria-hidden />
            <div className="relative z-[2] grid size-7 shrink-0 place-items-center rounded-lg border border-subtle bg-layer-2 text-secondary shadow-raised-100">
              <Icon className="size-3.5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-body-xs-regular text-secondary">
                <span className="font-medium text-primary">{displayName}</span>
                {item.activityType === "version" ? (
                  <span>
                    {item.source === "legacy_migration" ? "迁移生成了" : "生成了正式版本"} V{item.version}
                  </span>
                ) : (
                  <span>
                    对第 {item.sequence} 轮评审提交了
                    <span className={`ml-1 font-medium ${reviewMeta?.className}`}>{reviewMeta?.label}</span>
                  </span>
                )}
                <Tooltip
                  tooltipContent={`${renderFormattedDate(item.createdAt)} ${renderFormattedTime(item.createdAt)}`}
                  position="bottom"
                >
                  <span className="whitespace-nowrap text-tertiary">{calculateTimeAgo(item.createdAt)}</span>
                </Tooltip>
              </div>
              {item.activityType === "review" && item.reason && (
                <p className="mt-1 text-body-xs-regular leading-5 whitespace-pre-wrap text-secondary">{item.reason}</p>
              )}
              {item.changeId && (
                <button
                  type="button"
                  onClick={() => onOpenReview(item.changeId as string)}
                  className="mt-1 text-caption-sm-medium text-link-primary hover:text-link-primary-hover"
                >
                  查看本轮评审
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
});

const RequirementActivityComment = observer(function RequirementActivityComment(props: {
  item: Extract<TRequirementActivityItem, { activityType: "comment" }>;
  workspaceSlug: string;
  workspaceId: string;
  displayName: string;
  replyTargetName: string | null;
}) {
  const { item, workspaceSlug, workspaceId, displayName, replyTargetName } = props;
  const editorRef = useRef<EditorRefApi>(null);
  const memberAvatar = item.actor ? (item.actorDetail?.avatar_url ?? "") : "";

  return (
    <li>
      <div className="relative flex gap-3 py-2.5">
        <div className="absolute top-0 bottom-0 left-[13px] w-px bg-layer-3" aria-hidden />
        <div className="relative z-[2] grid size-7 shrink-0 place-items-center rounded-lg border border-subtle bg-layer-2 text-secondary shadow-raised-100">
          <CommentReplyIcon width={14} height={14} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 rounded-lg border border-subtle bg-layer-1/50 p-3 shadow-raised-100">
          <div className="mb-2 flex min-w-0 items-center gap-2">
            <Avatar
              size="sm"
              name={displayName}
              src={getFileURL(memberAvatar ?? "")}
              fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor(item.actorDetail)}
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 text-body-xs-regular">
              <span className="font-medium text-primary">{displayName}</span>
              {replyTargetName && (
                <>
                  <span className="text-secondary">回复</span>
                  <span className="font-medium text-primary">{replyTargetName}</span>
                </>
              )}
              <span className="text-secondary">评论于</span>
              <Tooltip
                tooltipContent={`${renderFormattedDate(item.createdAt)} ${renderFormattedTime(item.createdAt)}`}
                position="bottom"
              >
                <span className="text-tertiary">{calculateTimeAgo(item.createdAt)}</span>
              </Tooltip>
            </div>
          </div>
          <LiteTextEditor
            editable={false}
            ref={editorRef}
            id={`requirement_activity_comment_${item.comment.id}`}
            initialValue={item.comment.comment_html ?? ""}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            containerClassName="!py-1"
            parentClassName="border-none"
            displayConfig={{ fontSize: "small-font" }}
          />
        </div>
      </div>
    </li>
  );
});
