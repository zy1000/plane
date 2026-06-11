import { useCallback, useMemo, useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue } from "@plane/types";
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
      } finally {
        setIsSubmitting(false);
      }
    },
    [pendingStateChange]
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
