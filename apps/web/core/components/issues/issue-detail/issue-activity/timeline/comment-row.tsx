"use client";

/**
 * 时间线上的一条评论：发言人头像坐在轨道上，名字和时间在气泡外一行（和别的行一个节奏），
 * 右边是气泡。表情 / 菜单悬停才出现；编辑态把气泡换成编辑表单。
 */
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import type { EditorRefApi } from "@plane/editor";
import { useHashScroll } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { EmojiReactionButton, EmojiReactionPicker } from "@plane/propel/emoji-reaction";
import { GlobeIcon, LockIcon } from "@plane/propel/icons";
import type { TCommentsOperations, TIssueComment } from "@plane/types";
import { EIssueCommentAccessSpecifier } from "@plane/types";
import { cn } from "@plane/utils";
import { CommentCardEditForm } from "@/components/comments/card/edit-form";
import { CommentReactions } from "@/components/comments/comment-reaction";
import { CommentQuickActions } from "@/components/comments/quick-actions";
import { LiteTextEditor } from "@/components/editor/lite-text";
import { useMember } from "@/hooks/store/use-member";
import { ActivityTime, ActorName, AvatarNode, TimelineRow } from "./timeline-primitives";

export const ActivityCommentRow = observer(function ActivityCommentRow({
  comment,
  isFirst,
  isLast,
  workspaceSlug,
  projectId,
  activityOperations,
  showAccessSpecifier,
  showCopyLinkOption,
  disabled,
}: {
  comment: TIssueComment;
  isFirst: boolean;
  isLast: boolean;
  workspaceSlug: string;
  projectId: string;
  activityOperations: TCommentsOperations;
  showAccessSpecifier: boolean;
  showCopyLinkOption: boolean;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const pathname = usePathname();
  const readOnlyEditorRef = useRef<EditorRefApi>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isHighlighted, setIsHighlighted] = useState(false);

  const userDetails = getUserDetails(comment.actor);
  const displayName = comment.actor_detail?.is_bot
    ? `${comment.actor_detail.first_name}Bot`
    : (userDetails?.display_name ?? comment.actor_detail?.display_name ?? "");
  const avatarUrl = userDetails?.avatar_url ?? comment.actor_detail?.avatar_url;
  const workspaceId = comment.workspace;
  const commentBlockId = `comment-${comment.id}`;

  const userReactions = activityOperations.userReactions(comment.id);
  const reactionIds = activityOperations.reactionIds(comment.id);
  const hasReactions = !!reactionIds && Object.keys(reactionIds).some((key) => reactionIds[key]?.length > 0);

  // 评论深链（#comment-id）：滚过去并把气泡边框点亮几秒
  const { isHashMatch } = useHashScroll({ elementId: commentBlockId, pathname });
  useEffect(() => {
    if (!isHashMatch) return;
    setIsHighlighted(true);
    const timeout = setTimeout(() => setIsHighlighted(false), 8000);
    return () => clearTimeout(timeout);
  }, [isHashMatch]);

  return (
    <TimelineRow node={<AvatarNode name={displayName} src={avatarUrl} />} isFirst={isFirst} isLast={isLast}>
      <div id={commentBlockId} className="group/comment">
        <div className="flex min-h-7 items-center gap-2 text-14 text-secondary">
          <ActorName name={displayName} userId={comment.actor} workspaceSlug={workspaceSlug} />
          <span>{t("issue_activity.commented")}</span>
          {comment.edited_at && <span className="text-12 text-placeholder">{t("issue_activity.edited")}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {showAccessSpecifier &&
              (comment.access === EIssueCommentAccessSpecifier.INTERNAL ? (
                <LockIcon className="size-3 shrink-0 text-tertiary" />
              ) : (
                <GlobeIcon className="size-3 shrink-0 text-tertiary" />
              ))}
            {!disabled && (
              <span
                className={cn(
                  "flex items-center gap-1 transition-opacity",
                  isPickerOpen ? "opacity-100" : "opacity-0 group-hover/comment:opacity-100 focus-within:opacity-100"
                )}
              >
                <EmojiReactionPicker
                  isOpen={isPickerOpen}
                  handleToggle={setIsPickerOpen}
                  onChange={(emoji) => {
                    if (userReactions) void activityOperations.react(comment.id, emoji, userReactions);
                  }}
                  disabled={disabled}
                  label={<EmojiReactionButton onAddReaction={() => setIsPickerOpen(true)} />}
                  placement="bottom-start"
                />
                <CommentQuickActions
                  activityOperations={activityOperations}
                  comment={comment}
                  setEditMode={() => setIsEditing(true)}
                  showAccessSpecifier={showAccessSpecifier}
                  showCopyLinkOption={showCopyLinkOption}
                />
              </span>
            )}
            <ActivityTime value={comment.created_at} className="ml-1 pl-0" />
          </span>
        </div>
        <div
          className={cn(
            "mb-1 rounded-lg border border-subtle bg-surface-1 px-3.5 py-2 transition-[border-color] duration-500",
            isHighlighted && "border-accent-strong"
          )}
        >
          {isEditing ? (
            <CommentCardEditForm
              activityOperations={activityOperations}
              comment={comment}
              isEditing={isEditing}
              readOnlyEditorRef={readOnlyEditorRef.current}
              setIsEditing={setIsEditing}
              projectId={projectId}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
            />
          ) : (
            <>
              <LiteTextEditor
                editable={false}
                ref={readOnlyEditorRef}
                id={comment.id}
                initialValue={comment.comment_html ?? ""}
                workspaceId={workspaceId}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                containerClassName="!p-0"
                parentClassName="border-none"
                displayConfig={{ fontSize: "small-font" }}
              />
              {hasReactions && !disabled && (
                <div className="pt-1.5">
                  <CommentReactions comment={comment} disabled={disabled} activityOperations={activityOperations} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </TimelineRow>
  );
});
