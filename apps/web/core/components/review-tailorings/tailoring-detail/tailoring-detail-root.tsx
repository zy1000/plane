import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { Boxes, ChevronsDownUp, ChevronsUpDown, ListChecks, Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TReviewTailoringProduct, TSubmitReviewTailoringPayload } from "@plane/types";
import { AlertModalCore, Breadcrumbs, Loader, ToggleSwitch } from "@plane/ui";
import { copyUrlToClipboard } from "@plane/utils";
import { useReviewTailoringDetail } from "@/hooks/store/use-review-tailoring-detail";
import { useReviewTailoringFeed } from "@/hooks/store/use-review-tailoring-feed";
import { getTailoringError } from "@/hooks/store/use-review-tailorings";
import { useUser } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useAppRouter } from "@/hooks/use-app-router";
import { useReviewTailoringPermissions } from "../permissions";
import { AddProductsModal } from "./add-products-modal";
import { AddReviewsModal } from "./add-reviews-modal";
import { ApprovalPanel } from "./approval-panel";
import { DetailHeaderActions } from "./detail-header-actions";
import { DetailHero } from "./detail-hero";
import type { TDetailTab } from "./detail-tab-bar";
import { DetailTabBar } from "./detail-tab-bar";
import {
  REVIEW_TAILORING_DETAIL_ACTIONS_SLOT_ID,
  REVIEW_TAILORING_DETAIL_TITLE_SLOT_ID,
  useHeaderSlot,
} from "./header-slots";
import { SaveBar } from "./save-bar";
import { SubmitApprovalModal } from "./submit-approval-modal";
import { TailoringActivityFeed } from "./tailoring-activity-feed";
import { TailoringComments } from "./tailoring-comments";
import { TailoringItemsTable } from "./tailoring-items-table";
import { TailoringMatrix } from "./tailoring-matrix";
import type { TMatrixRow } from "./tailoring-matrix-model";
import { buildMatrixGroups, filterMatrixGroups, getCellLockReason, getTailoringStats } from "./tailoring-matrix-model";

const I18N = "review_tailoring";

/** 轴为空时的引导卡片。横轴纵轴共用一套版式，只是图标与文案不同 */
const AxisEmptyState = ({
  icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: string;
  onAction: () => void;
}) => (
  <div className="mx-6 my-5 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-subtle py-14">
    {icon}
    <p className="text-14 font-medium text-primary">{title}</p>
    <p className="max-w-sm text-center text-13 text-tertiary">{description}</p>
    {action && (
      <Button variant="primary" size="xl" className="mt-2" prependIcon={<Plus />} onClick={onAction}>
        {action}
      </Button>
    )}
  </div>
);

/** 待确认移除的行或列，连带它会带走多少格、多少条原因 */
type TRemoveTarget = { kind: "review" | "product"; id: string; name: string; cells: number; reasons: number };

/**
 * 裁剪表详情：顶栏（面包屑 + 主按钮）→ 标题区 →（签批中）签批面板 → Tab → 内容 →（有改动）改动条。
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
  const router = useAppRouter();
  const { data: currentUser } = useUser();
  const { getWorkspaceBySlug } = useWorkspace();
  const { canManage } = useReviewTailoringPermissions(workspaceSlug, projectId);
  const store = useReviewTailoringDetail(workspaceSlug, projectId, tailoringId);
  const feed = useReviewTailoringFeed(workspaceSlug, projectId, tailoringId);
  const titleHost = useHeaderSlot(REVIEW_TAILORING_DETAIL_TITLE_SLOT_ID);
  const actionsHost = useHeaderSlot(REVIEW_TAILORING_DETAIL_ACTIONS_SLOT_ID);

  const [tab, setTab] = useState<TDetailTab>("matrix");
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isAddProductsOpen, setIsAddProductsOpen] = useState(false);
  const [isAddReviewsOpen, setIsAddReviewsOpen] = useState(false);
  const [toRemove, setToRemove] = useState<TRemoveTarget | null>(null);
  const [isCancelRevisionOpen, setIsCancelRevisionOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  /** 矩阵的快速筛选：可编辑时是「只看缺原因」，只读时是「只看裁掉的」 */
  const [isFiltered, setIsFiltered] = useState(false);
  /** 收起的阶段。默认全展开 —— 建表后第一次进来应该看得见全貌 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { detail, items, isLoading, isMutating, isEditable, dirtyIds } = store;
  const stats = useMemo(() => getTailoringStats(items), [items]);
  const allGroups = useMemo(() => buildMatrixGroups(detail?.rows ?? [], items), [detail?.rows, items]);

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
        <Loader.Item height="72px" />
        <Loader.Item height="40px" />
        <Loader.Item height="320px" />
      </Loader>
    );
  }

  /** 编辑权 = 有 manage 且表处在可编辑状态 */
  const editable = canManage && isEditable;
  const filterMode = isFiltered ? (editable ? "missing" : "cut") : "all";
  const groups = filterMatrixGroups(allGroups, filterMode);
  const hasMatrix = detail.rows.length > 0 && detail.products.length > 0;

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

  /** 行首勾选框：全勾了就整行取消，否则整行勾上；锁住的格子跳过 */
  const handleToggleRow = (row: TMatrixRow) => {
    const cells = [...row.cells.values()];
    const next = !cells.every((cell) => cell.selected);
    store.setCells(
      cells.filter((cell) => cell.selected !== next && !getCellLockReason(cell, next)).map((cell) => cell.id),
      next
    );
  };

  /** 移除前先数清楚会带走什么；生成过评审的行列服务端会拦，这里提前说 */
  const requestRemove = (target: Omit<TRemoveTarget, "cells" | "reasons">, predicate: (item: (typeof items)[number]) => boolean) => {
    const cells = items.filter(predicate);
    if (cells.some((cell) => cell.stage_review_id)) {
      setToast({ type: TOAST_TYPE.ERROR, title: t(`${I18N}.actions.remove_axis_in_use`, { name: target.name }) });
      return;
    }
    setToRemove({
      ...target,
      cells: cells.length,
      reasons: cells.filter((cell) => !cell.selected && cell.reason.trim()).length,
    });
  };

  const toggleGroup = (stageId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  const isAllCollapsed = allGroups.length > 0 && allGroups.every((group) => collapsed.has(group.stageId));

  const detailPath = `${workspaceSlug}/projects/${projectId}/review-tailorings/${tailoringId}`;

  const tabs: { key: TDetailTab; label: string; count?: number }[] = [
    { key: "matrix", label: t(`${I18N}.matrix.title`) },
    { key: "items", label: t(`${I18N}.items.title`), count: items.length },
    { key: "activity", label: t(`${I18N}.activity.title`), count: feed.activities.length },
    { key: "comments", label: t(`${I18N}.comments.title`), count: feed.comments.length },
  ];

  const matrixTools = tab === "matrix" && hasMatrix && (
    <>
      {(stats.cut > 0 || isFiltered) && (
        <span className="flex items-center gap-1.5 px-2 text-13 text-tertiary">
          <ToggleSwitch value={isFiltered} onChange={setIsFiltered} size="sm" />
          <span className="cursor-pointer select-none" onClick={() => setIsFiltered((current) => !current)}>
            {t(editable ? `${I18N}.detail.only_missing` : `${I18N}.detail.only_cut`)}
          </span>
        </span>
      )}
      <Button
        variant="ghost"
        size="lg"
        prependIcon={isAllCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
        onClick={() =>
          setCollapsed(isAllCollapsed ? new Set() : new Set(allGroups.map((group) => group.stageId)))
        }
      >
        {t(isAllCollapsed ? `${I18N}.detail.expand_all` : `${I18N}.detail.collapse_all`)}
      </Button>
      {editable && (
        <>
          <Button variant="secondary" size="lg" prependIcon={<Plus />} onClick={() => setIsAddReviewsOpen(true)}>
            {t(`${I18N}.detail.add_review_short`)}
          </Button>
          <Button variant="secondary" size="lg" prependIcon={<Plus />} onClick={() => setIsAddProductsOpen(true)}>
            {t(`${I18N}.detail.add_product_short`)}
          </Button>
        </>
      )}
    </>
  );

  return (
    <div className="flex h-full flex-col">
      {titleHost &&
        createPortal(
          <>
            <Breadcrumbs.Separator />
            <Breadcrumbs.ItemWrapper type="text" isLast label={detail.title}>
              <Breadcrumbs.Label className="max-w-[320px]">{detail.title}</Breadcrumbs.Label>
            </Breadcrumbs.ItemWrapper>
          </>,
          titleHost
        )}
      {actionsHost &&
        createPortal(
          <DetailHeaderActions
            detail={detail}
            canManage={canManage}
            isMutating={isMutating}
            onSubmit={() => setIsSubmitOpen(true)}
            onRevise={() => void run(() => store.revise(), "revising")}
            onEditDescription={() => setIsEditingDescription(true)}
            onCancelRevision={() => setIsCancelRevisionOpen(true)}
            onCopyLink={() =>
              void copyUrlToClipboard(detailPath).then(() =>
                setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.list.link_copied`) })
              )
            }
            onDelete={() => setIsDeleteOpen(true)}
          />,
          actionsHost
        )}

      <div className="shrink-0">
        <DetailHero
          detail={detail}
          stats={stats}
          canManage={canManage}
          isEditingDescription={isEditingDescription}
          onEditingDescriptionChange={setIsEditingDescription}
          onTitleSave={(title) => void run(() => store.updateHeader({ title }), "updated")}
          onDescriptionSave={(description_html) => void run(() => store.updateHeader({ description_html }), "updated")}
        />
        <ApprovalPanel
          detail={detail}
          stats={stats}
          currentUserId={currentUser?.id}
          isMutating={isMutating}
          onApprove={(comment) => void run(() => store.act({ action: "approved", comment }), "approved")}
          onReject={(comment) => void run(() => store.act({ action: "rejected", comment }), "rejected")}
          onWithdraw={() => void run(() => store.withdraw(), "withdrawn")}
        />
      </div>

      <DetailTabBar tabs={tabs} active={tab} onChange={setTab} tools={matrixTools || undefined} />

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "matrix" &&
          // 两个轴各自的空态：谁空先引导谁，纵轴优先 —— 没有评审的表连一行都画不出来
          (detail.rows.length === 0 ? (
            <AxisEmptyState
              icon={<ListChecks className="size-8 text-placeholder" />}
              title={t(`${I18N}.matrix.empty_reviews_title`)}
              description={t(`${I18N}.matrix.empty_reviews_description`)}
              action={editable ? t(`${I18N}.actions.add_reviews`) : undefined}
              onAction={() => setIsAddReviewsOpen(true)}
            />
          ) : detail.products.length === 0 ? (
            <AxisEmptyState
              icon={<Boxes className="size-8 text-placeholder" />}
              title={t(`${I18N}.matrix.empty_products_title`)}
              description={t(`${I18N}.matrix.empty_products_description`)}
              action={editable ? t(`${I18N}.actions.add_products`) : undefined}
              onAction={() => setIsAddProductsOpen(true)}
            />
          ) : groups.length === 0 ? (
            <p className="px-6 py-10 text-center text-13 text-tertiary">
              {t(editable ? `${I18N}.detail.filtered_empty_missing` : `${I18N}.detail.filtered_empty_cut`)}
            </p>
          ) : (
            <TailoringMatrix
              groups={groups}
              allGroups={allGroups}
              items={items}
              products={detail.products}
              editable={editable}
              dirtyIds={dirtyIds}
              collapsed={collapsed}
              onToggleGroup={toggleGroup}
              onToggle={handleToggle}
              onToggleRow={handleToggleRow}
              onReasonChange={(itemId, reason) => store.setCell(itemId, { reason })}
              onRemoveReview={(row) =>
                requestRemove(
                  { kind: "review", id: row.templateId, name: row.title },
                  (item) => item.template_id === row.templateId || item.parent_template_id === row.templateId
                )
              }
              onRemoveProduct={(product: TReviewTailoringProduct) =>
                requestRemove({ kind: "product", id: product.id, name: product.name }, (item) => item.product_id === product.id)
              }
              onAddReviews={() => setIsAddReviewsOpen(true)}
              onAddProducts={() => setIsAddProductsOpen(true)}
            />
          ))}

        {tab === "items" && (
          <div className="px-6 py-4">
            <TailoringItemsTable
              items={items}
              products={detail.products}
              editable={editable}
              onReasonChange={(itemId, reason) => store.setCell(itemId, { reason })}
              onBulkReason={store.setReasonForMany}
            />
          </div>
        )}

        {tab === "activity" && (
          <div className="px-6 py-4">
            <TailoringActivityFeed activities={feed.activities} />
          </div>
        )}

        {tab === "comments" && (
          <div className="px-6 py-4">
            <TailoringComments
              comments={feed.comments}
              workspaceSlug={workspaceSlug}
              workspaceId={getWorkspaceBySlug(workspaceSlug)?.id ?? ""}
              projectId={projectId}
              isMutating={feed.isMutating}
              onCreate={feed.createComment}
              onDelete={feed.deleteComment}
            />
          </div>
        )}
      </div>

      {editable && (
        <SaveBar
          count={dirtyIds.size}
          isMutating={isMutating}
          onDiscard={store.resetCells}
          onSave={() => void run(() => store.saveCells(), "cells_saved")}
        />
      )}

      <SubmitApprovalModal
        isOpen={isSubmitOpen}
        isSubmitting={isMutating}
        projectId={projectId}
        stats={stats}
        onClose={() => setIsSubmitOpen(false)}
        onFixMissing={() => {
          setIsSubmitOpen(false);
          setTab("matrix");
          setIsFiltered(true);
          setCollapsed(new Set());
        }}
        onSubmit={async (payload: TSubmitReviewTailoringPayload) => {
          const ok = await run(() => store.submit(payload), "submitted");
          if (ok) setIsSubmitOpen(false);
        }}
      />

      <AddReviewsModal
        isOpen={isAddReviewsOpen}
        isSubmitting={isMutating}
        workspaceSlug={workspaceSlug}
        existingRows={detail.rows}
        onClose={() => setIsAddReviewsOpen(false)}
        onSubmit={async (templateIds) => {
          const ok = await run(() => store.addReviews(templateIds), "reviews_added");
          if (ok) setIsAddReviewsOpen(false);
        }}
      />

      <AddProductsModal
        isOpen={isAddProductsOpen}
        isSubmitting={isMutating}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        existingProducts={detail.products}
        rowCount={detail.rows.length}
        onClose={() => setIsAddProductsOpen(false)}
        onSubmit={async (productIds) => {
          const ok = await run(() => store.addProducts(productIds), "products_added");
          if (ok) setIsAddProductsOpen(false);
        }}
      />

      <AlertModalCore
        isOpen={Boolean(toRemove)}
        handleClose={() => setToRemove(null)}
        handleSubmit={async () => {
          if (!toRemove) return;
          const ok = await run(
            () => (toRemove.kind === "review" ? store.removeReview(toRemove.id) : store.removeProduct(toRemove.id)),
            "axis_removed"
          );
          if (ok) setToRemove(null);
        }}
        isSubmitting={isMutating}
        title={t(
          toRemove?.kind === "product" ? `${I18N}.actions.remove_column_title` : `${I18N}.actions.remove_row_title`,
          { name: toRemove?.name ?? "" }
        )}
        content={t(`${I18N}.actions.remove_axis_detail`, {
          cells: toRemove?.cells ?? 0,
          reasons: toRemove?.reasons ?? 0,
        })}
        primaryButtonText={{ loading: t("removing"), default: t("remove") }}
        secondaryButtonText={t("cancel")}
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
        primaryButtonText={{
          loading: t(`${I18N}.actions.cancel_revision_confirm`),
          default: t(`${I18N}.actions.cancel_revision_confirm`),
        }}
        secondaryButtonText={t("cancel")}
      />

      <AlertModalCore
        isOpen={isDeleteOpen}
        handleClose={() => setIsDeleteOpen(false)}
        handleSubmit={async () => {
          const ok = await run(() => store.deleteTailoring(), "deleted");
          if (!ok) return;
          setIsDeleteOpen(false);
          router.push(`/${workspaceSlug}/projects/${projectId}/review-tailorings`);
        }}
        isSubmitting={isMutating}
        title={t(`${I18N}.actions.delete_title`)}
        content={t(`${I18N}.actions.delete_content`)}
        primaryButtonText={{ loading: t("deleting"), default: t("delete") }}
        secondaryButtonText={t("cancel")}
      />
    </div>
  );
});
