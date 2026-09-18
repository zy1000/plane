import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { Boxes, ChevronsDownUp, ChevronsUpDown, ListChecks, Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TAddReviewTailoringAxesPayload,
  TReviewTailoringItem,
  TReviewTailoringProduct,
  TSubmitReviewTailoringPayload,
} from "@plane/types";
import { AlertModalCore, Breadcrumbs, Loader } from "@plane/ui";
import { cn, copyUrlToClipboard } from "@plane/utils";
import { useReviewTailoringDetail } from "@/hooks/store/use-review-tailoring-detail";
import { useReviewTailoringFeed } from "@/hooks/store/use-review-tailoring-feed";
import { getTailoringError } from "@/hooks/store/use-review-tailorings";
import { useUser } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useAppRouter } from "@/hooks/use-app-router";
import { useReviewTailoringPermissions } from "../permissions";
import { AddAxesModal } from "./add-axes-modal";
import { ReviewTailoringApprovalModal } from "./approval-modal";
import { BulkReasonModal } from "./bulk-reason-modal";
import { DetailHeaderActions } from "./detail-header-actions";
import { DetailHero } from "./detail-hero";
import type { TDetailTab } from "./detail-tab-bar";
import { DetailTabBar, TabBarSegments } from "./detail-tab-bar";
import {
  REVIEW_TAILORING_DETAIL_ACTIONS_SLOT_ID,
  REVIEW_TAILORING_DETAIL_TITLE_SLOT_ID,
  useHeaderSlot,
} from "./header-slots";
import { ItemsBulkBar } from "./items-bulk-bar";
import { ProductPager } from "./product-pager";
import { SaveBar } from "./save-bar";
import { SelectionBar } from "./selection-bar";
import { SubmitApprovalModal } from "./submit-approval-modal";
import { TailoringActivityFeed } from "./tailoring-activity-feed";
import { TailoringComments } from "./tailoring-comments";
import { buildItemRows, TailoringItemsTable } from "./tailoring-items-table";
import { TailoringMatrix } from "./tailoring-matrix";
import type { TMatrixFilter } from "./tailoring-matrix-model";
import { buildMatrixGroups, filterMatrixGroups, getCellLockReason, getTailoringStats } from "./tailoring-matrix-model";
import type { TTimelineFilter } from "./tailoring-timeline-model";
import { countTimeline } from "./tailoring-timeline-model";
import { useCellSelection } from "./use-cell-selection";
import { useMatrixScroll } from "./use-matrix-scroll";

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
 * 裁剪表详情：顶栏（面包屑 + 主按钮）→ 标题区 →（签批中）签批面板 → Tab → 内容 →（有改动）浮动改动条。
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
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);
  const [isAddAxesOpen, setIsAddAxesOpen] = useState(false);
  /** 明细里勾了几行之后点「填写原因」开的那只弹窗 */
  const [isBulkReasonOpen, setIsBulkReasonOpen] = useState(false);
  const [toRemove, setToRemove] = useState<TRemoveTarget | null>(null);
  const [isCancelRevisionOpen, setIsCancelRevisionOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  /** 矩阵的快速筛选：全部 / 裁剪 / 待补原因（只读时没有「待补原因」） */
  const [filter, setFilter] = useState<TMatrixFilter>("all");
  /** 明细 Tab 按产品筛，挂在 Tab 条右上角 */
  const [productFilter, setProductFilter] = useState("all");
  /** 变更历史的筛选：全部 / 状态 / 修改，挂在 Tab 条右上角 */
  const [timelineFilter, setTimelineFilter] = useState<TTimelineFilter>("all");
  /** 收起的阶段。默认全展开 —— 建表后第一次进来应该看得见全貌 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { detail, items, isLoading, isMutating, isEditable, dirtyIds } = store;
  const stats = useMemo(() => getTailoringStats(items), [items]);
  const allGroups = useMemo(() => buildMatrixGroups(detail?.rows ?? [], items), [detail?.rows, items]);
  /** 明细 Tab 当前筛选下的行：表格、表头全选、底部操作条的「选择全部」算的都是它 */
  const itemRows = useMemo(
    () => buildItemRows(items, detail?.products ?? [], productFilter),
    [items, detail?.products, productFilter]
  );
  const selection = useCellSelection();
  /** 矩阵的横向滚动：首列投影、右缘渐隐、产品列翻页器共用 */
  const scroll = useMatrixScroll(
    `${tab}:${detail?.products.length ?? 0}:${allGroups.length}:${collapsed.size}:${filter}`
  );

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
  const activeFilter: TMatrixFilter = !editable && filter === "missing" ? "all" : filter;
  const groups = filterMatrixGroups(allGroups, activeFilter);
  const hasMatrix = detail.rows.length > 0 && detail.products.length > 0;
  /** 选中的格子以当前数据为准：行列被移除后，残留的 id 自然不算 */
  const selectedCells =
    editable && (tab === "matrix" || tab === "items")
      ? items.filter((item) => selection.selectedIds.has(item.id))
      : [];
  /** 选中的行里真正能写原因的那批：保留项不留原因，自动跳过 */
  const selectedCut = selectedCells.filter((cell) => !cell.selected);

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

  /** 批量保留 / 裁剪选中的格子：已经是目标值的、锁住的格子跳过；应用完清掉选中 */
  const handleSetCells = (cells: TReviewTailoringItem[], selected: boolean) => {
    store.setCells(
      cells.filter((cell) => cell.selected !== selected && !getCellLockReason(cell, selected)).map((cell) => cell.id),
      selected
    );
    selection.clear();
  };

  const changeFilter = (next: TMatrixFilter) => {
    setFilter(next);
    // 筛选一变，看得见的格子就变了，留着看不见的选中容易误改
    selection.clear();
  };

  /** 换 Tab、换明细的筛选，同理：看得见的那批变了就清掉选中 */
  const changeTab = (next: TDetailTab) => {
    setTab(next);
    selection.clear();
  };
  const changeProductFilter = (next: string) => {
    setProductFilter(next);
    selection.clear();
  };

  /** 移除前先数清楚会带走什么；生成过评审的行列服务端会拦，这里提前说 */
  const requestRemove = (target: Omit<TRemoveTarget, "cells" | "reasons">, predicate: (item: TReviewTailoringItem) => boolean) => {
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

  const filterOptions: { key: TMatrixFilter; label: string; count?: number; tone?: "warning" }[] = [
    { key: "all", label: t(`${I18N}.detail.filter_all`) },
    { key: "cut", label: t(`${I18N}.detail.filter_cut`), count: stats.cut },
    ...(editable
      ? [{ key: "missing" as const, label: t(`${I18N}.detail.filter_missing`), count: stats.missing, tone: "warning" as const }]
      : []),
  ];

  const itemsTools = tab === "items" && (
    <>
      <select
        value={productFilter}
        onChange={(event) => changeProductFilter(event.target.value)}
        className="focus:border-accent-primary h-7 rounded border border-subtle bg-surface-1 px-2 text-12 text-primary outline-none"
      >
        <option value="all">{t(`${I18N}.items.filter_all_products`)}</option>
        {detail.products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name}
          </option>
        ))}
      </select>
    </>
  );

  const timelineCounts = countTimeline(feed.activities);
  const activityTools = tab === "activity" && feed.activities.length > 0 && (
    <TabBarSegments
      value={timelineFilter}
      options={[
        { key: "all" as const, label: t(`${I18N}.activity.filter_all`), count: timelineCounts.all },
        { key: "status" as const, label: t(`${I18N}.activity.filter_status`), count: timelineCounts.status },
        { key: "edits" as const, label: t(`${I18N}.activity.filter_edits`), count: timelineCounts.edits },
      ]}
      onChange={setTimelineFilter}
    />
  );

  const matrixTools = tab === "matrix" && hasMatrix && (
    <>
      {(stats.cut > 0 || activeFilter !== "all") && (
        <TabBarSegments value={activeFilter} options={filterOptions} onChange={changeFilter} />
      )}
      <ProductPager scroll={scroll} />
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
        <Button variant="secondary" size="lg" onClick={() => setIsAddAxesOpen(true)}>
          {t("add")}
        </Button>
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
            currentUserId={currentUser?.id}
            onOpenApproval={() => setIsApprovalOpen(true)}
            onSubmit={() => setIsSubmitOpen(true)}
            onRevise={() => void run(() => store.revise(), "revising")}
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
          onTitleSave={(title) => void run(() => store.updateHeader({ title }), "updated")}
          onDescriptionSave={(description_html) => void run(() => store.updateHeader({ description_html }), "updated")}
        />
      </div>

      <DetailTabBar tabs={tabs} active={tab} onChange={changeTab} tools={matrixTools || itemsTools || activityTools || undefined} />

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroll.ref}
          // 全局默认把滚动条藏了，这两个类才让它画出来 —— 产品多的时候横向滚动条是唯一的出路
          className={cn(
            "horizontal-scrollbar vertical-scrollbar scrollbar-lg h-full overflow-auto",
            editable && (dirtyIds.size > 0 || selectedCells.length > 0) && "pb-20"
          )}
        >
          {tab === "matrix" &&
            // 两个轴各自的空态：谁空先引导谁，纵轴优先 —— 没有评审的表连一行都画不出来
            (detail.rows.length === 0 ? (
              <AxisEmptyState
                icon={<ListChecks className="size-8 text-placeholder" />}
                title={t(`${I18N}.matrix.empty_reviews_title`)}
                description={t(`${I18N}.matrix.empty_reviews_description`)}
                action={editable ? t(`${I18N}.detail.add_axes`) : undefined}
                onAction={() => setIsAddAxesOpen(true)}
              />
            ) : detail.products.length === 0 ? (
              <AxisEmptyState
                icon={<Boxes className="size-8 text-placeholder" />}
                title={t(`${I18N}.matrix.empty_products_title`)}
                description={t(`${I18N}.matrix.empty_products_description`)}
                action={editable ? t(`${I18N}.detail.add_axes`) : undefined}
                onAction={() => setIsAddAxesOpen(true)}
              />
            ) : groups.length === 0 ? (
              <p className="px-6 py-10 text-center text-13 text-tertiary">
                {t(activeFilter === "missing" ? `${I18N}.detail.filtered_empty_missing` : `${I18N}.detail.filtered_empty_cut`)}
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
                isScrolled={scroll.isScrolled}
                onToggleGroup={toggleGroup}
                onToggle={handleToggle}
                selection={selection}
                onReasonChange={(itemId, reason) => store.setCell(itemId, { reason })}
                onRemoveReview={(row) =>
                  requestRemove(
                    { kind: "review", id: row.templateId, name: row.title },
                    (item) => item.template_id === row.templateId
                  )
                }
                onRemoveProduct={(product: TReviewTailoringProduct) =>
                  requestRemove({ kind: "product", id: product.id, name: product.name }, (item) => item.product_id === product.id)
                }
                onAddAxes={() => setIsAddAxesOpen(true)}
              />
            ))}

          {/* 明细表和矩阵一样满宽铺开：外面不再套一层内边距，左右上都不留空档 */}
          {tab === "items" && (
            <TailoringItemsTable
              rows={itemRows}
              products={detail.products}
              editable={editable}
              dirtyIds={dirtyIds}
              selection={selection}
              onToggle={handleToggle}
              onReasonChange={(itemId, reason) => store.setCell(itemId, { reason })}
            />
          )}

          {tab === "activity" && (
            <div className="px-6 py-4">
              <TailoringActivityFeed activities={feed.activities} products={detail.products} filter={timelineFilter} />
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

        {/* 右边还有列没露出来时，最后一列上压一条渐隐 —— 光有滚动条不够显眼 */}
        {tab === "matrix" && hasMatrix && scroll.hasMore && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-12 right-0 bottom-4 w-14 bg-[linear-gradient(90deg,transparent,var(--bg-surface-1))]"
          />
        )}

        {/* 有选中时操作条占住底部的位置；取消选中后改动条再出来 */}
        {selectedCells.length > 0 ? (
          tab === "items" ? (
            <ItemsBulkBar
              count={selectedCells.length}
              total={itemRows.length}
              cutCount={selectedCut.length}
              onSelectAll={() => selection.toggle(itemRows)}
              onClear={selection.clear}
              onKeep={() => handleSetCells(selectedCells, true)}
              onCut={() => handleSetCells(selectedCells, false)}
              onReason={() => setIsBulkReasonOpen(true)}
            />
          ) : (
            <SelectionBar
              count={selectedCells.length}
              onKeep={() => handleSetCells(selectedCells, true)}
              onCut={() => handleSetCells(selectedCells, false)}
              onClear={selection.clear}
            />
          )
        ) : (
          editable && (
            <SaveBar
              count={dirtyIds.size}
              isMutating={isMutating}
              onDiscard={store.resetCells}
              onSave={() => void run(() => store.saveCells(), "cells_saved")}
            />
          )
        )}
      </div>

      <SubmitApprovalModal
        isOpen={isSubmitOpen}
        isSubmitting={isMutating}
        projectId={projectId}
        stats={stats}
        onClose={() => setIsSubmitOpen(false)}
        onFixMissing={() => {
          setIsSubmitOpen(false);
          setTab("matrix");
          changeFilter("missing");
          setCollapsed(new Set());
        }}
        onSubmit={async (payload: TSubmitReviewTailoringPayload) => {
          const ok = await run(() => store.submit(payload), "submitted");
          if (ok) setIsSubmitOpen(false);
        }}
      />

      <ReviewTailoringApprovalModal
        isOpen={isApprovalOpen}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        store={store}
        onClose={() => setIsApprovalOpen(false)}
        onDone={() => {
          setIsApprovalOpen(false);
          // 每个签批动作都会写一条活动，历史那一栏要跟着刷
          void feed.fetchFeed().catch(() => undefined);
        }}
      />

      <BulkReasonModal
        isOpen={isBulkReasonOpen}
        selectedCount={selectedCells.length}
        cutCount={selectedCut.length}
        overwriteCount={selectedCut.filter((cell) => cell.reason.trim()).length}
        onApply={(reason) => {
          store.setReasonForMany(
            selectedCut.map((cell) => cell.id),
            reason
          );
          selection.clear();
        }}
        onClose={() => setIsBulkReasonOpen(false)}
      />

      <AddAxesModal
        isOpen={isAddAxesOpen}
        isSubmitting={isMutating}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        existingRows={detail.rows}
        existingProducts={detail.products}
        onClose={() => setIsAddAxesOpen(false)}
        onSubmit={async (payload: TAddReviewTailoringAxesPayload) => {
          const ok = await run(() => store.addAxes(payload), "axes_added");
          if (ok) setIsAddAxesOpen(false);
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
