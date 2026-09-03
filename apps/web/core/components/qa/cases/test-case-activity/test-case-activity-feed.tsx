import { useRef } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import {
  Activity as ActivityIcon,
  CheckCircle2,
  FileText,
  MessageSquareIcon,
  Paperclip,
  Tag,
  Trash2,
  UserCog,
} from "lucide-react";
import type { EditorRefApi } from "@plane/editor";
import { E_SORT_ORDER } from "@plane/constants";
import { CommentReplyIcon } from "@plane/propel/icons";
import type { TTestCaseActivity } from "@plane/types";
import { Avatar, Loader, Tooltip } from "@plane/ui";
import { calculateTimeAgo, getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { LiteTextEditor } from "@/components/editor/lite-text";
import { getUserAvatarFallbackBackgroundColor } from "@/helpers/user-avatar.helper";
import { useMember } from "@/hooks/store/use-member";
import { useTestCaseActivity } from "@/hooks/store/use-test-case-activity";
import { useUser } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { TEST_CASE_FIELD_LABELS, buildTestCaseActivityMessage } from "./test-case-activity-message";
import { isContentChangeActivity } from "./test-case-change-model";
import { TestCaseContentChange } from "./test-case-content-change";

type Props = {
  workspaceSlug: string;
  /** 模板用例没有项目语境，不传；只用于渲染评论富文本 */
  projectId?: string;
  caseId: string;
  activities?: TTestCaseActivity[];
  emptyHint?: string;
  limit?: number;
  filterFn?: (activity: TTestCaseActivity) => boolean;
  sortOrder?: E_SORT_ORDER;
};

const TestCaseCommentBlock = observer(function TestCaseCommentBlock(props: {
  activity: TTestCaseActivity;
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
}) {
  const { activity, workspaceSlug, workspaceId, projectId } = props;
  const { getUserDetails } = useMember();
  const readOnlyEditorRef = useRef<EditorRefApi>(null);

  const userDetails = activity.actor ? getUserDetails(activity.actor) : undefined;
  const displayName =
    userDetails?.display_name ?? activity.actor_detail?.display_name ?? (activity.actor ? "未知用户" : "系统");
  const avatarUrl = userDetails?.avatar_url ?? activity.actor_detail?.avatar_url;
  const commentHtml = typeof activity.extra?.comment_html === "string" ? activity.extra.comment_html : "";

  const replyToActor = typeof activity.extra?.reply_to_actor === "string" ? activity.extra.reply_to_actor : null;
  const replyToFallbackName =
    typeof activity.extra?.reply_to_name === "string" ? activity.extra.reply_to_name : null;
  const replyToName = replyToActor
    ? (getUserDetails(replyToActor)?.display_name ?? replyToFallbackName ?? "未知用户")
    : replyToFallbackName;

  return (
    <li>
      <div className="relative flex gap-3 py-2">
        <div className="absolute top-0 bottom-0 left-[13px] w-px bg-layer-3" aria-hidden />
        <div className="relative z-[3] flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-subtle bg-layer-2 uppercase shadow-raised-100">
          <CommentReplyIcon width={14} height={14} className="text-secondary" aria-hidden="true" />
        </div>
        <div className="flex flex-grow flex-col gap-3 truncate">
          <div className="mb-2 rounded-lg border border-subtle bg-layer-2 p-3 text-body-sm-regular shadow-raised-100">
            <div className="relative flex flex-col gap-2">
              <div className="relative mb-3 flex w-full items-center gap-2">
                <Avatar
                  size="sm"
                  name={displayName}
                  src={getFileURL(avatarUrl ?? "")}
                  className="shrink-0"
                  fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor(activity.actor_detail)}
                />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-body-sm-regular">
                  <span className="font-medium text-primary">{displayName}</span>
                  {replyToName && (
                    <>
                      <span className="text-secondary">回复</span>
                      <span className="font-medium text-primary">{replyToName}</span>
                    </>
                  )}
                  <span className="text-secondary">
                    评论于{" "}
                    <Tooltip
                      tooltipContent={`${renderFormattedDate(activity.created_at)} at ${renderFormattedTime(activity.created_at)}`}
                      position="bottom"
                    >
                      <span className="whitespace-nowrap text-tertiary">{calculateTimeAgo(activity.created_at)}</span>
                    </Tooltip>
                  </span>
                </div>
              </div>
              <LiteTextEditor
                editable={false}
                ref={readOnlyEditorRef}
                id={`test_case_activity_comment_${activity.id}`}
                initialValue={commentHtml}
                workspaceId={workspaceId}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                containerClassName="!py-1"
                parentClassName="border-none"
                displayConfig={{ fontSize: "small-font" }}
              />
            </div>
          </div>
        </div>
      </div>
    </li>
  );
});

const iconForActivity = (activity: TTestCaseActivity): React.ReactNode => {
  const { field, verb } = activity;
  if (verb === "deleted") return <Trash2 size={12} aria-hidden />;
  switch (field) {
    case "comment":
      return <MessageSquareIcon size={12} aria-hidden />;
    case "review":
      return <CheckCircle2 size={12} aria-hidden />;
    case "execution":
      return <Tag size={12} aria-hidden />;
    case "assignee":
      return <UserCog size={12} aria-hidden />;
    case "attachment":
      return <Paperclip size={12} aria-hidden />;
    case "case":
    case "name":
    case "precondition":
    case "steps":
    case "text_description":
    case "text_result":
      return <FileText size={12} aria-hidden />;
    default:
      return <ActivityIcon size={12} aria-hidden />;
  }
};

const TestCaseActivityRow = observer(function TestCaseActivityRow(props: {
  activity: TTestCaseActivity;
  workspaceSlug: string;
  workspaceId: string;
  projectId?: string;
}) {
  const { activity, workspaceSlug, workspaceId, projectId } = props;
  const { getUserDetails } = useMember();
  const { data: currentUser } = useUser();

  if (projectId && activity.field === "comment" && typeof activity.extra?.comment_html === "string") {
    return (
      <TestCaseCommentBlock
        activity={activity}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        projectId={projectId}
      />
    );
  }

  const actorDetail = activity.actor ? getUserDetails(activity.actor) : undefined;
  const isSystem = !activity.actor;
  const isCurrentUser = !!currentUser && currentUser.id === activity.actor;
  const displayName = isSystem
    ? "系统"
    : isCurrentUser
      ? "你"
      : (actorDetail?.display_name ?? activity.actor_detail?.display_name ?? "未知用户");
  const avatarUrl = actorDetail?.avatar_url ?? activity.actor_detail?.avatar_url ?? null;

  // 富文本与步骤的正文进不了标题行：换成「字段 + 规模徽章 + 展开」，对照面板另起一行
  if (isContentChangeActivity(activity)) {
    return (
      <li>
        <div className="relative flex gap-3 py-2 text-body-sm-regular">
          <div className="absolute top-0 bottom-0 left-[13px] w-px bg-layer-3" aria-hidden />
          <div className="z-[4] mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-subtle bg-layer-2 text-secondary shadow-raised-100 [&_svg]:!text-secondary">
            {isSystem ? (
              iconForActivity(activity)
            ) : (
              <Avatar
                size="sm"
                name={displayName}
                src={getFileURL(avatarUrl ?? undefined)}
                fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor()}
              />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-2 text-secondary">
            <span className="font-medium text-secondary">{displayName}</span>
            <span>更新了</span>
            <span className="font-medium text-primary">
              {TEST_CASE_FIELD_LABELS[activity.field ?? ""] ?? activity.field}
            </span>
            <TestCaseContentChange activity={activity} />
            <span className="ml-auto flex-shrink-0 self-start whitespace-nowrap text-tertiary">
              {calculateTimeAgo(activity.created_at)}
            </span>
          </div>
        </div>
      </li>
    );
  }

  const message = buildTestCaseActivityMessage(activity);

  return (
    <li>
      <div className="relative flex items-center gap-3 py-2 text-body-sm-regular">
        <div className="absolute top-0 bottom-0 left-[13px] w-px bg-layer-3" aria-hidden />
        <div className="z-[4] flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-subtle bg-layer-2 text-secondary shadow-raised-100 [&_svg]:!text-secondary">
          {isSystem ? (
            iconForActivity(activity)
          ) : (
            <Avatar
              size="sm"
              name={displayName}
              src={getFileURL(avatarUrl ?? undefined)}
              fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor()}
            />
          )}
        </div>
        <div className="min-w-0 flex-1 text-secondary">
          <div className="flex min-w-0 items-baseline gap-1">
            <span className="flex-shrink-0 font-medium text-secondary">{displayName}</span>
            <Tooltip tooltipContent={message} position="top">
              <span className="min-w-0 flex-1 truncate">{message}</span>
            </Tooltip>
            <span className="flex-shrink-0 whitespace-nowrap text-tertiary">
              {calculateTimeAgo(activity.created_at)}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
});

export const TestCaseActivityFeed = observer(function TestCaseActivityFeed(props: Props) {
  const {
    workspaceSlug,
    projectId,
    caseId,
    activities: providedActivities,
    emptyHint = "暂无动态",
    limit,
    filterFn,
    sortOrder,
  } = props;
  const { getActivitiesByCaseId, isLoadingByCaseId, fetchActivities } = useTestCaseActivity();
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const rawActivities = providedActivities ?? getActivitiesByCaseId(caseId);
  const allActivities = filterFn ? rawActivities.filter(filterFn) : rawActivities;
  const activities =
    typeof limit === "number" && limit >= 0
      ? limit > 0
        ? allActivities.slice(-limit).reverse()
        : []
      : sortOrder === E_SORT_ORDER.DESC
        ? [...allActivities].reverse()
        : allActivities;
  const isLoading = isLoadingByCaseId(caseId);

  useSWR(
    workspaceSlug && caseId ? ["test-case-activities", workspaceSlug, caseId] : null,
    () => fetchActivities(workspaceSlug, caseId)
  );

  if (isLoading && activities.length === 0) {
    return (
      <Loader className="space-y-3">
        <Loader.Item height="36px" />
        <Loader.Item height="36px" />
        <Loader.Item height="36px" />
      </Loader>
    );
  }

  if (activities.length === 0) {
    return <div className="py-10 text-center text-sm text-placeholder">{emptyHint}</div>;
  }

  return (
    <ul role="list" className="relative">
      {activities.map((activity) => (
        <TestCaseActivityRow
          key={activity.id}
          activity={activity}
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          projectId={projectId}
        />
      ))}
    </ul>
  );
});
