/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { MessageSquare, MoreHorizontal } from "lucide-react";
import type { EditorRefApi } from "@plane/editor";
import type { TReleaseComment } from "@plane/types";
import { TrashIcon } from "@plane/propel/icons";
import { IconButton } from "@plane/propel/icon-button";
import { Avatar, CustomMenu, Tooltip } from "@plane/ui";
import type { TContextMenuItem } from "@plane/ui";
import { calculateTimeAgo, getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { LiteTextEditor } from "@/components/editor/lite-text";
import { ReleaseCommentCreate } from "./release-comment-create";
import { flattenCommentDescendants } from "./release-comment-utils";
import { getUserAvatarFallbackBackgroundColor } from "@/helpers/user-avatar.helper";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";

type ReplyPayload = {
  comment_html: string;
  comment_json?: unknown;
  parent: string | null;
};

type Props = {
  comment: TReleaseComment;
  childrenByParent: Record<string, TReleaseComment[]>;
  commentsById: Record<string, TReleaseComment>;
  depth: number;
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  releaseId: string;
  disabled?: boolean;
  canCreateComment?: boolean;
  onRemove: (commentId: string) => Promise<unknown>;
  onReply: (data: ReplyPayload) => Promise<TReleaseComment | undefined>;
};

export const ReleaseCommentCard = observer(function ReleaseCommentCard(props: Props) {
  const {
    comment,
    childrenByParent,
    commentsById,
    depth,
    workspaceSlug,
    workspaceId,
    projectId,
    releaseId,
    disabled = false,
    canCreateComment = true,
    onRemove,
    onReply,
  } = props;
  // store hooks
  const { data: currentUser } = useUser();
  const { getUserDetails } = useMember();
  // states
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [areRepliesExpanded, setAreRepliesExpanded] = useState(false);
  // refs
  const readOnlyEditorRef = useRef<EditorRefApi>(null);

  const descendantComments = useMemo(
    () => (depth === 0 ? flattenCommentDescendants(comment.id, childrenByParent) : []),
    [childrenByParent, comment.id, depth]
  );
  const isAuthor = currentUser?.id === comment.actor;
  const canDelete = isAuthor && !disabled;
  const canReply = !disabled && canCreateComment;
  const isReply = depth > 0;

  const getCommentActorName = (targetComment: TReleaseComment | undefined) => {
    if (!targetComment) return "未知用户";
    const targetUserDetails = getUserDetails(targetComment.actor);
    return targetUserDetails?.display_name ?? targetComment.actor_detail?.display_name ?? "未知用户";
  };

  const userDetails = getUserDetails(comment.actor);
  const displayName = getCommentActorName(comment);
  const avatarUrl = userDetails?.avatar_url ?? comment.actor_detail?.avatar_url ?? comment.actor_detail?.avatar ?? null;
  const parentComment = comment.parent ? commentsById[comment.parent] : undefined;
  const replyTargetName = parentComment?.parent ? getCommentActorName(parentComment) : null;

  const handleDelete = async () => {
    try {
      await onRemove(comment.id);
    } catch (error) {
      console.error("[release-comment] delete failed", error);
    }
  };

  const menuItems = useMemo<TContextMenuItem[]>(
    () => [
      {
        key: "delete",
        action: handleDelete,
        title: "删除",
        icon: TrashIcon,
        shouldRender: canDelete,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canDelete]
  );

  const hasMenu = menuItems.some((item) => item.shouldRender !== false);

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
              id={comment.id}
              initialValue={comment.comment_html ?? ""}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              containerClassName="!p-0"
              parentClassName="border-none"
              displayConfig={{ fontSize: "small-font" }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-tertiary">
          <Tooltip
            tooltipContent={`${renderFormattedDate(comment.created_at)} ${renderFormattedTime(comment.created_at)}`}
            position="bottom"
          >
            <span className="whitespace-nowrap">{calculateTimeAgo(comment.created_at)}</span>
          </Tooltip>
          {canReply && (
            <button
              type="button"
              onClick={() => setIsReplyOpen((prev) => !prev)}
              className="flex items-center gap-1 transition-colors hover:text-primary"
            >
              <MessageSquare className="h-3 w-3" />
              {isReplyOpen ? "收起" : "回复"}
            </button>
          )}
          {hasMenu && (
            <CustomMenu customButton={<IconButton icon={MoreHorizontal} variant="ghost" size="sm" />} closeOnSelect>
              {menuItems.map((item) =>
                item.shouldRender === false ? null : (
                  <CustomMenu.MenuItem key={item.key} onClick={() => item.action()} className="flex items-center gap-2">
                    {item.icon && <item.icon className="size-3 shrink-0" />}
                    <span className="text-sm">{item.title}</span>
                  </CustomMenu.MenuItem>
                )
              )}
            </CustomMenu>
          )}
        </div>

        {isReplyOpen && (
          <div className="mt-1">
            <ReleaseCommentCreate
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              projectId={projectId}
              releaseId={releaseId}
              parentId={comment.id}
              placeholder="回复评论..."
              autoFocus
              showCancel
              onCancel={() => setIsReplyOpen(false)}
              onSubmit={async (data) => {
                if (!canReply) return undefined;
                const created = await onReply(data);
                setIsReplyOpen(false);
                return created;
              }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-2">
      <div className="relative flex w-full items-center gap-2">
        <Avatar
          size="sm"
          name={displayName}
          src={avatarUrl ? getFileURL(avatarUrl) : undefined}
          className="shrink-0"
          fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor()}
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-body-sm-regular">
          <span className="font-medium text-primary">{displayName}</span>
        </div>
        {hasMenu && (
          <CustomMenu customButton={<IconButton icon={MoreHorizontal} variant="ghost" size="sm" />} closeOnSelect>
            {menuItems.map((item) =>
              item.shouldRender === false ? null : (
                <CustomMenu.MenuItem key={item.key} onClick={() => item.action()} className="flex items-center gap-2">
                  {item.icon && <item.icon className="size-3 shrink-0" />}
                  <span className="text-sm">{item.title}</span>
                </CustomMenu.MenuItem>
              )
            )}
          </CustomMenu>
        )}
      </div>

      <LiteTextEditor
        editable={false}
        ref={readOnlyEditorRef}
        id={comment.id}
        initialValue={comment.comment_html ?? ""}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        containerClassName="!py-1"
        parentClassName="border-none"
        displayConfig={{ fontSize: "small-font" }}
      />

      <div className="flex items-center gap-2 pl-1 text-xs text-tertiary">
        <Tooltip
          tooltipContent={`${renderFormattedDate(comment.created_at)} ${renderFormattedTime(comment.created_at)}`}
          position="bottom"
        >
          <span className="whitespace-nowrap">{calculateTimeAgo(comment.created_at)}</span>
        </Tooltip>
        {canReply && (
          <button
            type="button"
            onClick={() => setIsReplyOpen((prev) => !prev)}
            className="flex items-center gap-1 transition-colors hover:text-primary"
          >
            <MessageSquare className="h-3 w-3" />
            {isReplyOpen ? "收起" : "回复"}
          </button>
        )}
        {descendantComments.length > 0 && (
          <button
            type="button"
            onClick={() => setAreRepliesExpanded((prev) => !prev)}
            className="font-medium text-link-primary transition-colors hover:text-link-primary-hover"
          >
            {areRepliesExpanded ? "收起回复" : `展开 ${descendantComments.length} 条回复`}
          </button>
        )}
      </div>

      {isReplyOpen && (
        <div className="mt-1 ml-9 border-l border-subtle pl-3">
          <ReleaseCommentCreate
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            projectId={projectId}
            releaseId={releaseId}
            parentId={comment.id}
            placeholder="回复评论..."
            autoFocus
            showCancel
            onCancel={() => setIsReplyOpen(false)}
            onSubmit={async (data) => {
              if (!canReply) return undefined;
              const created = await onReply(data);
              setIsReplyOpen(false);
              setAreRepliesExpanded(true);
              return created;
            }}
          />
        </div>
      )}

      {areRepliesExpanded && descendantComments.length > 0 && (
        <div className="mt-1 ml-9 flex flex-col gap-3 border-l border-subtle pl-3">
          {descendantComments.map((child) => (
            <ReleaseCommentCard
              key={child.id}
              comment={child}
              childrenByParent={childrenByParent}
              commentsById={commentsById}
              depth={1}
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              projectId={projectId}
              releaseId={releaseId}
              disabled={disabled}
              canCreateComment={canCreateComment}
              onRemove={onRemove}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  );
});
