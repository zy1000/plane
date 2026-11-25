/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { findValueForField, isValueEmpty } from "@/components/issues/extra-fields";
import { IssueApprovalTag } from "@/components/issues/issue-approval-tag";
// hooks
import { useIssueAvailableTransitions } from "@/hooks/store/use-issue-available-transitions";
import { useIssueApprovalStatus } from "@/hooks/store/use-issue-approval-status";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUser } from "@/hooks/store/user";
import type { TIssueEditSession } from "@/hooks/use-issue-edit-session";
// services
import type { TAvailableTransition } from "@/services/project/project-workflow.service";
import { ProjectWorkflowService } from "@/services/project/project-workflow.service";

const workflowService = new ProjectWorkflowService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  session: TIssueEditSession;
  /** 有编辑权限才出流转按钮；审批中的标签所有人都看得到 */
  canEdit: boolean;
  isArchived?: boolean;
};

/**
 * 页头「编辑」左边：当前用户能发起的流转按钮，全部平铺。
 * 有要填的（必填字段没填、要指定处理人、要审批）→ 进入编辑态带提示条；什么都不用填 → 直接流转。
 * 有待审批的流转时换成「审批中 · 操作名称」，发起人可撤回。
 */
export const IssueTransitionActions = observer(function IssueTransitionActions(props: Props) {
  const { workspaceSlug, projectId, issueId, session, canEdit, isArchived } = props;
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const { data: currentUser } = useUser();
  const issue = getIssueById(issueId);
  const { records, hasPendingApproval, invalidate } = useIssueApprovalStatus(workspaceSlug, projectId, issueId);
  const { transitions, refresh } = useIssueAvailableTransitions(
    workspaceSlug,
    projectId,
    issueId,
    issue?.state_id,
    canEdit && !isArchived && !hasPendingApproval
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  // 本地状态是先乐观改的，随状态变化拉的列表可能早于 PATCH 落库；编辑会话结束（保存完 / 取消）再拉一次
  const wasEditing = useRef(session.isEditing);
  useEffect(() => {
    if (wasEditing.current && !session.isEditing) void refresh();
    wasEditing.current = session.isEditing;
  }, [refresh, session.isEditing]);

  if (!issue || isArchived || !currentUser) return null;

  const pendingRecord = records[0];
  if (hasPendingApproval && pendingRecord) {
    const canWithdraw = pendingRecord.created_by === currentUser.id;
    const handleWithdraw = async () => {
      setBusyId(pendingRecord.id);
      try {
        await workflowService.withdrawTransitionRecord(workspaceSlug, projectId, pendingRecord.id);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "已撤回", message: "状态流转申请已撤回" });
      } catch (error) {
        const message = (error as { error?: string } | undefined)?.error ?? "撤回失败，请重试";
        setToast({ type: TOAST_TYPE.ERROR, title: "撤回失败", message });
      } finally {
        setBusyId(null);
        invalidate();
      }
    };
    return (
      <div className="flex items-center gap-2">
        <IssueApprovalTag workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} variant="button" />
        {canWithdraw && (
          <Button variant="secondary" size="lg" onClick={() => void handleWithdraw()} loading={busyId !== null}>
            撤回
          </Button>
        )}
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-subtle" />
      </div>
    );
  }

  if (!canEdit || session.isEditing || transitions.length === 0) return null;

  const values = issue.extra_field_values ?? [];
  const needsInput = (transition: TAvailableTransition) =>
    transition.requires_approval ||
    transition.assignee_required ||
    transition.required_fields.some((field) => isValueEmpty(findValueForField(values, field.id)));

  const handleClick = async (transition: TAvailableTransition) => {
    if (needsInput(transition)) {
      session.startTransition(transition);
      return;
    }
    setBusyId(transition.id);
    try {
      await session.operations.update(workspaceSlug, projectId, issueId, { state_id: transition.to_state_id });
    } finally {
      setBusyId(null);
      invalidate();
      // PATCH 已经结束，按库里的状态重拉
      void refresh();
    }
  };

  const fromName = getStateById(issue.state_id)?.name ?? "";
  return (
    <div className="flex items-center gap-2">
      {transitions.map((transition) => (
        <Button
          key={transition.id}
          variant="secondary"
          size="lg"
          title={`${fromName} → ${transition.to_state_name}`}
          loading={busyId === transition.id}
          disabled={busyId !== null}
          onClick={() => void handleClick(transition)}
        >
          {transition.action_name}
          {transition.requires_approval && (
            <span className="ml-1.5 rounded-sm bg-warning-subtle px-1.5 text-12 leading-[18px] font-medium text-warning-primary">
              需审批
            </span>
          )}
        </Button>
      ))}
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-subtle" />
    </div>
  );
});
