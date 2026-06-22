import { useCallback, useMemo, useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue } from "@plane/types";
import {
  extractIssueUpdateErrorMessage,
  isWorkflowApprovalInitiated,
  type TIssueWorkflowUpdateError,
} from "@/components/issues/workflow-error-utils";
import { useIssueStateTransition } from "./use-issue-state-transition";

export type TStateTransitionUpdatePayload = Pick<TIssue, "state_id"> & Partial<Pick<TIssue, "assignee_ids">>;

type TSubmitStateTransitionUpdate = (payload: TStateTransitionUpdatePayload) => Promise<void> | void;

type TPendingStateTransitionChange = {
  issue: TIssue;
  nextStateId: string;
  allowedAssigneeIds: string[];
  submit: TSubmitStateTransitionUpdate;
};

export const useStateTransitionAssigneeGuard = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const { evaluateStateTransition } = useIssueStateTransition(workspaceSlug, projectId);
  const [pendingStateChange, setPendingStateChange] = useState<TPendingStateTransitionChange | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showTransitionErrorToast = useCallback((error: unknown) => {
    const errorData = error as TIssueWorkflowUpdateError;
    const approvalInitiated = isWorkflowApprovalInitiated(errorData);
    const errorMessage = extractIssueUpdateErrorMessage(errorData);

    setToast({
      type: approvalInitiated ? TOAST_TYPE.INFO : TOAST_TYPE.ERROR,
      title: approvalInitiated ? "已发起审批流程" : "状态切换失败",
      message: errorMessage ?? (approvalInitiated ? "该状态变更需审批人通过后才会生效" : "请稍后重试"),
    });
  }, []);

  const closeModal = useCallback(() => {
    if (isSubmitting) return;
    setPendingStateChange(null);
  }, [isSubmitting]);

  const requestStateChange = useCallback(
    async (issue: TIssue, nextStateId: string, submit: TSubmitStateTransitionUpdate) => {
      const transitionCheck = await evaluateStateTransition(issue, nextStateId);
      if (!transitionCheck.shouldPromptAssigneeSelection) {
        await submit({ state_id: nextStateId });
        return;
      }

      if (transitionCheck.allowedAssigneeIds.length === 0) {
        setToast({
          type: TOAST_TYPE.WARNING,
          title: "无法切换状态",
          message: "目标状态未解析到可选负责人，请联系项目管理员检查工作流规则。",
        });
        return;
      }

      setPendingStateChange({
        issue,
        nextStateId,
        allowedAssigneeIds: transitionCheck.allowedAssigneeIds,
        submit,
      });
    },
    [evaluateStateTransition]
  );

  const confirmAssigneeSelection = useCallback(
    async (assigneeIds: string[]) => {
      if (!pendingStateChange) return;

      setIsSubmitting(true);
      try {
        await pendingStateChange.submit({
          state_id: pendingStateChange.nextStateId,
          assignee_ids: assigneeIds,
        });
        setPendingStateChange(null);
      } catch (error) {
        showTransitionErrorToast(error);
        setPendingStateChange(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [pendingStateChange, showTransitionErrorToast]
  );

  const modalProps = useMemo(
    () => ({
      isOpen: Boolean(pendingStateChange),
      projectId: pendingStateChange?.issue.project_id ?? "",
      allowedAssigneeIds: pendingStateChange?.allowedAssigneeIds ?? [],
      initialAssigneeIds: pendingStateChange?.issue.assignee_ids ?? [],
      isSubmitting,
      onClose: closeModal,
      onConfirm: confirmAssigneeSelection,
    }),
    [closeModal, confirmAssigneeSelection, isSubmitting, pendingStateChange]
  );

  return {
    requestStateChange,
    modalProps,
  };
};
