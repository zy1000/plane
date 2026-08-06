import { useCallback, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementChangeType } from "@plane/types";

type TChangesStore = {
  isMutating: boolean;
  submitReview: (payload: {
    reason?: string;
    items: { requirement_id: string; change_type?: TRequirementChangeType }[];
  }) => Promise<unknown>;
  cancelChangeRequest: (changeRequestId: string) => Promise<unknown>;
};

/**
 * 提交评审 / 撤回。
 *
 * 单条与批量走同一条路径 —— 单条提交就是 items.length === 1。撤回作用在**变更单**上，
 * 所以它天然不是批量动作：一个选区可能跨多张单。
 */
export const useRequirementApprovalActions = ({
  changesStore,
  onSettled,
  onSubmitted,
}: {
  changesStore: TChangesStore;
  onSettled: () => void;
  onSubmitted?: () => void;
}) => {
  const { t } = useTranslation();
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  /** 待提交的需求 id；也决定弹窗里列出哪几条 */
  const [pendingSelection, setPendingSelection] = useState<string[]>([]);
  const [pendingChangeType, setPendingChangeType] = useState<TRequirementChangeType | undefined>();

  const openSubmitModal = useCallback(
    (requirementIds: string[], changeType?: TRequirementChangeType) => {
      if (!requirementIds.length) return;
      setPendingSelection(requirementIds);
      setPendingChangeType(changeType);
      setIsSubmitModalOpen(true);
    },
    []
  );

  const closeSubmitModal = useCallback(() => {
    setIsSubmitModalOpen(false);
    setPendingSelection([]);
    setPendingChangeType(undefined);
  }, []);

  const submit = useCallback(
    async (reason: string) => {
      if (!pendingSelection.length) return;
      try {
        await changesStore.submitReview({
          reason,
          items: pendingSelection.map((requirementId) => ({
            requirement_id: requirementId,
            ...(pendingChangeType ? { change_type: pendingChangeType } : {}),
          })),
        });
        closeSubmitModal();
        onSettled();
        onSubmitted?.();
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("success"),
          message: t("workspace_products.requirements.approval.toast.submitted", {
            count: pendingSelection.length,
          }),
        });
      } catch (error) {
        const payload = error as { code?: string; error?: string };
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: payload?.error ?? t("workspace_products.requirements.toast.failed"),
        });
      }
    },
    [changesStore, closeSubmitModal, onSettled, onSubmitted, pendingChangeType, pendingSelection, t]
  );

  const withdraw = useCallback(
    async (changeRequestId: string) => {
      try {
        await changesStore.cancelChangeRequest(changeRequestId);
        onSettled();
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("success"),
          message: t("workspace_products.requirements.approval.toast.withdrawn"),
        });
      } catch (error) {
        const payload = error as { error?: string };
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: payload?.error ?? t("workspace_products.requirements.toast.failed"),
        });
      }
    },
    [changesStore, onSettled, t]
  );

  return {
    isSubmitModalOpen,
    pendingSelection,
    openSubmitModal,
    closeSubmitModal,
    submit,
    withdraw,
  };
};
