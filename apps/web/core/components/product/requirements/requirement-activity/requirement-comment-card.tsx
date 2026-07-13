import { useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { MessageSquare, MoreHorizontal } from "lucide-react";
import type { EditorRefApi } from "@plane/editor";
import { TrashIcon } from "@plane/propel/icons";
import { IconButton } from "@plane/propel/icon-button";
import { Avatar, CustomMenu, Tooltip } from "@plane/ui";
import type { TContextMenuItem } from "@plane/ui";
import { calculateTimeAgo, getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { LiteTextEditor } from "@/components/editor/lite-text";
import { getUserAvatarFallbackBackgroundColor } from "@/helpers/user-avatar.helper";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import type { TRequirementComment, TRequirementCommentPayload } from "@/services/requirement-comment.service";
import { flattenRequirementCommentDescendants } from "./requirement-activity-utils";
import { RequirementCommentCreate } from "./requirement-comment-create";

type Props = {
  comment: TRequirementComment;
  childrenByParent: Record<string, TRequirementComment[]>;
  commentsById: Record<string, TRequirementComment>;
  depth: number;
  workspaceSlug: string;
  workspaceId: string;
  productId: string;
  requirementId: string;
  disabled?: boolean;
  onRemove: (commentId: string) => Promise<void>;
  onReply: (data: TRequirementCommentPayload) => Promise<TRequirementComment | undefined>;
};

export const RequirementCommentCard = observer(function RequirementCommentCard(props: Props) {
  const {
    comment,
    childrenByParent,
    commentsById,
    depth,
    workspaceSlug,
    workspaceId,
    productId,
    requirementId,
    disabled = false,
    onRemove,
    onReply,
  } = props;
  const { data: currentUser } = useUser();
  const { getUserDetails } = useMember();
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [areRepliesExpanded, setAreRepliesExpanded] = useState(false);
  const readOnlyEditorRef = useRef<EditorRefApi>(null);

  const descendants = useMemo(
    () => (depth === 0 ? flattenRequirementCommentDescendants(comment.id, childrenByParent) : []),
    [childrenByParent, comment.id, depth]
  );
  const isReply = depth > 0;
  const canReply = !disabled;
  const canDelete = !disabled && currentUser?.id === comment.actor;

  const getActorName = (target?: TRequirementComment) => {
    if (!target) return "未知用户";
    return getUserDetails(target.actor)?.display_name ?? target.actor_detail?.display_name ?? "未知用户";
  };
  const displayName = getActorName(comment);
  const member = getUserDetails(comment.actor);
  const avatarUrl = member?.avatar_url ?? comment.actor_detail?.avatar_url ?? "";
  const parentComment = comment.parent ? commentsById[comment.parent] : undefined;
  const replyTargetName = parentComment?.parent ? getActorName(parentComment) : null;

  const menuItems = useMemo<TContextMenuItem[]>(
    () => [
      {
        key: "delete",
        title: "删除",
        icon: TrashIcon,
        shouldRender: canDelete,
        action: async () => {
          try {
            await onRemove(comment.id);
          } catch (error) {
            console.error("[requirement-comment] delete failed", error);
          }
        },
      },
    ],
    [canDelete, comment.id, onRemove]
  );
  const hasMenu = menuItems.some((item) => item.shouldRender !== false);

  const replyComposer = isReplyOpen ? (
    <div className={isReply ? "mt-1" : "mt-2 ml-9 border-l border-subtle pl-3"}>
      <RequirementCommentCreate
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        productId={productId}
        requirementId={requirementId}
        parentId={comment.id}
        placeholder="回复评论..."
        showCancel
        onCancel={() => setIsReplyOpen(false)}
        onSubmit={async (data) => {
          const created = await onReply(data);
          if (created) {
            setIsReplyOpen(false);
            setAreRepliesExpanded(true);
          }
          return created;
        }}
      />
    </div>
  ) : null;

  if (isReply) {
    return (
      <div className="relative flex flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-start gap-x-1 text-body-sm-regular text-primary">
          <span className="shrink-0 break-words">
            <span className="font-medium">{displayName}</span>
            {replyTargetName && (
              <>
                <span className="text-secondary"> 回复 </span>
                <span className="font-medium">{replyTargetName}</span>
              </>
            )}
            <span className="text-secondary">：</span>
          </span>
          <div className="min-w-0 flex-1">
            <LiteTextEditor
              editable={false}
              ref={readOnlyEditorRef}
              id={`requirement_comment_display_${comment.id}`}
              initialValue={comment.comment_html ?? ""}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
              containerClassName="!p-0"
              parentClassName="border-none"
              displayConfig={{ fontSize: "small-font" }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 text-caption-sm-regular text-tertiary">
          <Tooltip
            tooltipContent={`${renderFormattedDate(comment.created_at)} ${renderFormattedTime(comment.created_at)}`}
            position="bottom"
          >
            <span>{calculateTimeAgo(comment.created_at)}</span>
          </Tooltip>
          {canReply && (
            <button
              type="button"
              onClick={() => setIsReplyOpen((current) => !current)}
              className="flex items-center gap-1 transition-colors hover:text-primary"
            >
              <MessageSquare className="size-3" />
              {isReplyOpen ? "收起" : "回复"}
            </button>
          )}
          {hasMenu && (
            <CustomMenu customButton={<IconButton icon={MoreHorizontal} variant="ghost" size="sm" />} closeOnSelect>
              {menuItems.map((item) =>
                item.shouldRender === false ? null : (
                  <CustomMenu.MenuItem key={item.key} onClick={() => item.action()} className="flex items-center gap-2">
                    {item.icon && <item.icon className="size-3" />}
                    <span>{item.title}</span>
                  </CustomMenu.MenuItem>
                )
              )}
            </CustomMenu>
          )}
        </div>
        {replyComposer}
      </div>
    );
  }

  return (
    <article className="relative flex flex-col gap-2 rounded-lg border border-subtle bg-layer-1/50 p-3 shadow-raised-100">
      <div className="flex items-start gap-2.5">
        <Avatar
          size="sm"
          name={displayName}
          src={getFileURL(avatarUrl)}
          className="shrink-0"
          fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor(comment.actor_detail)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-body-xs-medium text-primary">{displayName}</span>
            {hasMenu && (
              <CustomMenu customButton={<IconButton icon={MoreHorizontal} variant="ghost" size="sm" />} closeOnSelect>
                {menuItems.map((item) =>
                  item.shouldRender === false ? null : (
                    <CustomMenu.MenuItem
                      key={item.key}
                      onClick={() => item.action()}
                      className="flex items-center gap-2"
                    >
                      {item.icon && <item.icon className="size-3" />}
                      <span>{item.title}</span>
                    </CustomMenu.MenuItem>
                  )
                )}
              </CustomMenu>
            )}
          </div>
          <LiteTextEditor
            editable={false}
            ref={readOnlyEditorRef}
            id={`requirement_comment_display_${comment.id}`}
            initialValue={comment.comment_html ?? ""}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            containerClassName="!py-1"
            parentClassName="border-none"
            displayConfig={{ fontSize: "small-font" }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 pl-9 text-caption-sm-regular text-tertiary">
        <Tooltip
          tooltipContent={`${renderFormattedDate(comment.created_at)} ${renderFormattedTime(comment.created_at)}`}
          position="bottom"
        >
          <span>{calculateTimeAgo(comment.created_at)}</span>
        </Tooltip>
        {canReply && (
          <button
            type="button"
            onClick={() => setIsReplyOpen((current) => !current)}
            className="flex items-center gap-1 transition-colors hover:text-primary"
          >
            <MessageSquare className="size-3" />
            {isReplyOpen ? "收起" : "回复"}
          </button>
        )}
        {descendants.length > 0 && (
          <button
            type="button"
            onClick={() => setAreRepliesExpanded((current) => !current)}
            className="font-medium text-link-primary transition-colors hover:text-link-primary-hover"
          >
            {areRepliesExpanded ? "收起回复" : `展开 ${descendants.length} 条回复`}
          </button>
        )}
      </div>
      {replyComposer}
      {areRepliesExpanded && descendants.length > 0 && (
        <div className="mt-1 ml-9 flex flex-col gap-3 border-l border-subtle pl-3">
          {descendants.map((child) => (
            <RequirementCommentCard
              key={child.id}
              comment={child}
              childrenByParent={childrenByParent}
              commentsById={commentsById}
              depth={1}
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              productId={productId}
              requirementId={requirementId}
              disabled={disabled}
              onRemove={onRemove}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </article>
  );
});
