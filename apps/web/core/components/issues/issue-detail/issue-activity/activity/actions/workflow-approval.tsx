/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ClipboardCheck, CheckCircle2, XCircle } from "lucide-react";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { IssueActivityBlockComponent } from "./helpers/activity-block";

type TProps = { activityId: string; ends: "top" | "bottom" | undefined };

/** 解析后端写入的取消审批 comment，例如：必填字段缺失，审批已取消（A → B）：xxx */
function parseWorkflowCancelComment(comment: string | undefined, fallbackFrom: string) {
  const text = (comment || "").trim();
  const matched = text.match(/^(.*?)（(.+?) → (.+?)）(?:：([\s\S]+))?$/);
  if (matched) {
    return {
      prefix: matched[1].trim() || "已取消待审批流程",
      fromName: matched[2] || fallbackFrom,
      toName: matched[3] || undefined,
      detail: matched[4]?.trim() || undefined,
    };
  }
  if (text) {
    return { prefix: text, fromName: fallbackFrom, toName: undefined, detail: undefined };
  }
  return { prefix: "已取消待审批流程", fromName: fallbackFrom, toName: undefined, detail: undefined };
}

/**
 * 展示「发起审批申请」或「审批最终被拒绝」这两个系统事件。
 * field = "workflow_approval_request"
 */
export const IssueWorkflowApprovalRequestActivity = observer(function IssueWorkflowApprovalRequestActivity(
  props: TProps
) {
  const { activityId, ends } = props;
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);
  if (!activity) return <></>;

  const isRejected = activity.verb === "updated" && activity.new_value === "rejected";
  const isCancelled = activity.verb === "updated" && activity.new_value === "cancelled";
  const fromName = activity.old_value || "—";
  const toName =
    activity.new_value && activity.new_value !== "rejected" && activity.new_value !== "cancelled"
      ? activity.new_value
      : activity.old_value || "—";
  const cancelContent = isCancelled ? parseWorkflowCancelComment(activity.comment, fromName) : null;
  // 校验失败取消由系统触发；仅「直接更改状态」保留操作者
  const isSystemCancel = Boolean(cancelContent && !cancelContent.prefix.includes("直接更改状态"));

  return (
    <IssueActivityBlockComponent
      icon={
        isRejected || isCancelled ? (
          <XCircle className={`h-3.5 w-3.5 ${isCancelled ? "text-secondary" : "text-red-500"}`} />
        ) : (
          <ClipboardCheck className="h-3.5 w-3.5 text-secondary" />
        )
      }
      activityId={activityId}
      ends={ends}
      customUserName={isRejected || isSystemCancel ? "系统" : undefined}
    >
      {isRejected ? (
        <>
          工作流审批被拒绝，状态变更取消
          <span className="font-medium text-primary">
            （{activity.old_value} → {toName}）
          </span>
        </>
      ) : isCancelled && cancelContent ? (
        <>
          {cancelContent.prefix}
          <span className="font-medium text-primary">
            （{cancelContent.fromName}
            {cancelContent.toName ? ` → ${cancelContent.toName}` : ""}）
          </span>
          {cancelContent.detail ? `：${cancelContent.detail}` : null}
        </>
      ) : (
        <>
          发起了状态变更审批申请
          <span className="font-medium text-primary">
            （{fromName} → {activity.new_value}）
          </span>
        </>
      )}
    </IssueActivityBlockComponent>
  );
});
/**
 * 展示单个审批人的「通过」或「拒绝」操作。
 * field = "workflow_approval_action"
 */
export const IssueWorkflowApprovalActionActivity = observer(function IssueWorkflowApprovalActionActivity(
  props: TProps
) {
  const { activityId, ends } = props;
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);
  if (!activity) return <></>;

  const approved = activity.new_value === "approved";

  return (
    <IssueActivityBlockComponent
      icon={
        approved ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-red-500" />
        )
      }
      activityId={activityId}
      ends={ends}
    >
      <span className={approved ? "text-emerald-600" : "text-red-600"}>
        {approved ? "通过" : "拒绝"}
      </span>
      了状态变更审批申请
    </IssueActivityBlockComponent>
  );
});
