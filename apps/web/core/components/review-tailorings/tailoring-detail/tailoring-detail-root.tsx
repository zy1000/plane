import { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TSubmitReviewTailoringPayload } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { useReviewTailoringDetail } from "@/hooks/store/use-review-tailoring-detail";
import { useReviewTailoringFeed } from "@/hooks/store/use-review-tailoring-feed";
import { getTailoringError } from "@/hooks/store/use-review-tailorings";
import { useUser } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useReviewTailoringPermissions } from "../permissions";
import { AddProductsModal } from "./add-products-modal";
import { TailoringApprovalBar } from "./approval-bar";
import { SubmitApprovalModal } from "./submit-approval-modal";
import { TailoringActivityFeed } from "./tailoring-activity-feed";
import { TailoringComments } from "./tailoring-comments";
import { TailoringHeader } from "./tailoring-header";
import { TailoringItemsTable } from "./tailoring-items-table";
import { TailoringMatrix } from "./tailoring-matrix";
import { getCellLockReason } from "./tailoring-matrix-model";

const I18N = "review_tailoring";

type TTab = "matrix" | "items" | "activity" | "comments";

/**
 * 裁剪表详情：头部 + 矩阵 + 下方三个 Tab（明细 / 变更历史 / 评论），签批中时底部出签批条。
 *
 * 矩阵与明细读的是**同一份本地格子**，在哪边改都算同一批未保存改动 —— 两处各存一份
 * 会立刻出现「明细里填了原因，矩阵还标着缺原因」。
 */
export const ReviewTailoringDetailRoot = observer(function ReviewTailoringDetailRoot({
  workspaceSlug,
  projectId,
  tailoringId,
}: {
  workspaceSlug: string;
  projectId: string;
  tailoringId: string;
}) {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { getWorkspaceBySlug } = useWorkspace();
  const { canManage } = useReviewTailoringPermissions(workspaceSlug, projectId);
  const store = useReviewTailoringDetail(workspaceSlug, projectId, tailoringId);
  const feed = useReviewTailoringFeed(workspaceSlug, projectId, tailoringId);

  const [tab, setTab] = useState<TTab>("matrix");
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isAddProductsOpen, setIsAddProductsOpen] = useState(false);
  const [isCancelRevisionOpen, setIsCancelRevisionOpen] = useState(false);

  const { detail, items, isLoading, isMutating, isDirty, isEditable } = store;

  const translateError = (requestError: unknown) => {
    const { message, code } = getTailoringError(requestError);
    return code ? t(`${I18N}.errors.${code}`, { defaultValue: message }) : message;
  };

  /** 所有动作共用一套 toast：成功一句、失败把领域错误码翻成中文 */
  const run = async (action: () => Promise<unknown>, successKey: string) => {
    try {
      await action();
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.${successKey}`) });
      // 每个动作都会写一条活动，历史那一栏要跟着刷
      void feed.fetchFeed().catch(() => undefined);
      return true;
    } catch (requestError) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(`${I18N}.toast.failed`),
        message: translateError(requestError),
      });
      return false;
    }
  };

  if (isLoading || !detail) {
    return (
      <Loader className="space-y-3 p-6">
        <Loader.Item height="48px" />
        <Loader.Item height="320px" />
      </Loader>
    );
  }

  /** 编辑权 = 有 manage 且表处在可编辑状态 */
  const editable = canManage && isEditable;

  const handleToggle = (itemId: string, selected: boolean) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;
    const lock = getCellLockReason(item, selected);
    if (lock) {
      setToast({ type: TOAST_TYPE.ERROR, title: t(`${I18N}.matrix.${lock}`) });
      return;
    }
    store.setCell(itemId, { selected });
  };

  const tabs: { key: TTab; label: string; count?: number }[] = [
    { key: "matrix", label: t(`${I18N}.matrix.title`) },
    { key: "items", label: t(`${I18N}.items.title`), count: items.length },
    { key: "activity", label: t(`${I18N}.activity.title`), count: feed.activities.length },
    { key: "comments", label: t(`${I18N}.comments.title`), count: feed.comments.length },
  ];

  return (
    <div className="flex h-full flex-col">
      <TailoringHeader
        detail={detail}
        canManage={canManage}
        isDirty={isDirty}
        isMutating={isMutating}
        onTitleSave={(title) => void run(() => store.updateHeader({ title }), "updated")}
        onSaveCells={() => void run(() => store.saveCells(), "cells_saved")}
        onSubmit={() => setIsSubmitOpen(true)}
        onAddProducts={() => setIsAddProductsOpen(true)}
        onRevise={() => void run(() => store.revise(), "revising")}
        onCancelRevision={() => setIsCancelRevisionOpen(true)}
      />

      <div className="flex gap-1 border-b border-subtle px-6">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-12 transition-colors",
              tab === entry.key
                ? "border-accent-primary text-primary font-medium"
                : "border-transparent text-tertiary hover:text-secondary"
            )}
            onClick={() => setTab(entry.key)}
          >
            {entry.label}
            {typeof entry.count === "number" && <span className="ml-1 tabular-nums">{entry.count}</span>}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {tab === "matrix" && (
          <>
            {!editable && canManage && detail.status === EReviewTailoringStatus.APPROVED && (
              <p className="mb-3 text-11 text-tertiary">{t(`${I18N}.matrix.readonly_hint`)}</p>
            )}
            <TailoringMatrix
              items={items}
              products={detail.products}
              editable={editable}
              onToggle={handleToggle}
              onReasonChange={(itemId, reason) => store.setCell(itemId, { reason })}
            />
          </>
        )}

        {tab === "items" && (
          <TailoringItemsTable
            items={items}
            products={detail.products}
            stageLabel={detail.stage_detail?.label ?? ""}
            editable={editable}
            onReasonChange={(itemId, reason) => store.setCell(itemId, { reason })}
            onBulkReason={store.setReasonForMany}
          />
        )}

        {tab === "activity" && <TailoringActivityFeed activities={feed.activities} />}

        {tab === "comments" && (
          <TailoringComments
            comments={feed.comments}
            workspaceSlug={workspaceSlug}
            workspaceId={getWorkspaceBySlug(workspaceSlug)?.id ?? ""}
            projectId={projectId}
            isMutating={feed.isMutating}
            onCreate={feed.createComment}
            onDelete={feed.deleteComment}
          />
        )}
      </div>

      <TailoringApprovalBar
        detail={detail}
        currentUserId={currentUser?.id}
        isMutating={isMutating}
        onApprove={(comment) => void run(() => store.act({ action: "approved", comment }), "approved")}
        onReject={(comment) => void run(() => store.act({ action: "rejected", comment }), "rejected")}
        onWithdraw={() => void run(() => store.withdraw(), "withdrawn")}
      />

      <SubmitApprovalModal
        isOpen={isSubmitOpen}
        isSubmitting={isMutating}
        projectId={projectId}
        onClose={() => setIsSubmitOpen(false)}
        onSubmit={async (payload: TSubmitReviewTailoringPayload) => {
          const ok = await run(() => store.submit(payload), "submitted");
          if (ok) setIsSubmitOpen(false);
        }}
      />

      <AddProductsModal
        isOpen={isAddProductsOpen}
        isSubmitting={isMutating}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        existingProducts={detail.products}
        onClose={() => setIsAddProductsOpen(false)}
        onSubmit={async (productIds) => {
          const ok = await run(() => store.addProducts(productIds), "products_added");
          if (ok) setIsAddProductsOpen(false);
        }}
      />

      <AlertModalCore
        isOpen={isCancelRevisionOpen}
        handleClose={() => setIsCancelRevisionOpen(false)}
        handleSubmit={async () => {
          const ok = await run(() => store.cancelRevision(), "revision_cancelled");
          if (ok) setIsCancelRevisionOpen(false);
        }}
        isSubmitting={isMutating}
        title={t(`${I18N}.actions.cancel_revision_title`)}
        content={t(`${I18N}.actions.cancel_revision_content`)}
      />
    </div>
  );
});
