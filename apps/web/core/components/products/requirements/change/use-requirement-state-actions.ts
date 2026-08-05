/**
 * 基线状态流转的编排层：编辑 / 提交审批 / 撤回草稿 / 撤回审批。
 *
 * 每个动作都是「调 hook → 弹 toast → 通知外层」的固定三段，加上两个确认弹窗的开合，
 * 放在页面组件里会把它撑到没法读，所以整体抽成 hook。
 */
import { useCallback, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementBaseline } from "@plane/types";
import type { useRequirementChangeRequests } from "@/hooks/store/use-requirement-changes";

type TChangesStore = ReturnType<typeof useRequirementChangeRequests>;

const LOCALIZED_STATE_ERROR_CODES = new Set(["REQUIREMENT_APPROVER_REQUIRED"]);

export const useRequirementStateActions = ({
  baseline,
  changesStore,
  pendingChangeRequestId,
  onLayerChanged,
  onSubmitted,
}: {
  baseline: TRequirementBaseline | null | undefined;
  changesStore: TChangesStore;
  pendingChangeRequestId: string | null;
  /**
   * 状态流转会切换读写的数据层（正式表 ↔ 草稿层），字段配置与条目都得重新拉一遍，
   * 否则页面还拿着上一层的内容和乐观锁时间戳。
   */
  onLayerChanged: () => void;
  /** 提交成功后跳到变更记录 Tab */
  onSubmitted: () => void;
}) => {
  const { t } = useTranslation();
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);

  const notifyFailure = useCallback(
    (error: unknown) => {
      const payload = error as { code?: string; error?: string };
      const message =
        payload?.code && LOCALIZED_STATE_ERROR_CODES.has(payload.code)
          ? t(`workspace_products.requirements.state.errors.${payload.code}`)
          : (payload?.error ?? t("workspace_products.requirements.state.toast.failed"));
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message,
      });
    },
    [t]
  );

  const startEditing = useCallback(async () => {
    try {
      await changesStore.startEditing();
      onLayerChanged();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_products.requirements.state.toast.editing"),
      });
    } catch (error) {
      notifyFailure(error);
    }
  }, [changesStore, notifyFailure, onLayerChanged, t]);

  const submitReview = useCallback(
    async (reason: string) => {
      try {
        await changesStore.submitChangeRequest(reason);
        setIsSubmitModalOpen(false);
        onLayerChanged();
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("success"),
          message: t("workspace_products.requirements.state.toast.submitted"),
        });
        onSubmitted();
      } catch (error) {
        notifyFailure(error);
      }
    },
    [changesStore, notifyFailure, onLayerChanged, onSubmitted, t]
  );

  const discardDraft = useCallback(async () => {
    try {
      const response = await changesStore.discardDraft();
      setIsDiscardModalOpen(false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t(`workspace_products.requirements.state.toast.${response.outcome}`),
      });
      onLayerChanged();
    } catch (error) {
      notifyFailure(error);
    }
  }, [changesStore, notifyFailure, onLayerChanged, t]);

  const withdrawReview = useCallback(async () => {
    if (!pendingChangeRequestId) return;
    try {
      await changesStore.cancelChangeRequest(pendingChangeRequestId);
      setIsWithdrawModalOpen(false);
      onLayerChanged();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_products.requirements.change.toast.cancelled"),
      });
    } catch (error) {
      notifyFailure(error);
    }
  }, [changesStore, notifyFailure, onLayerChanged, pendingChangeRequestId, t]);

  return {
    isSubmitModalOpen,
    isDiscardModalOpen,
    isWithdrawModalOpen,
    openSubmitModal: () => setIsSubmitModalOpen(true),
    closeSubmitModal: () => setIsSubmitModalOpen(false),
    openDiscardModal: () => setIsDiscardModalOpen(true),
    closeDiscardModal: () => setIsDiscardModalOpen(false),
    openWithdrawModal: () => setIsWithdrawModalOpen(true),
    closeWithdrawModal: () => setIsWithdrawModalOpen(false),
    hasPublishedVersion: (baseline?.current_version ?? null) !== null,
    startEditing,
    submitReview,
    discardDraft,
    withdrawReview,
  };
};
