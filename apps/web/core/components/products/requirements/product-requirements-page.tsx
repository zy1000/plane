import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Database, History, Inbox, Layers } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IUserLite, TRequirementItemStatus } from "@plane/types";
import { cn } from "@plane/utils";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { RequirementCreateModal } from "@/components/requirements/requirement-create-modal";
import { RequirementGrid, type TRequirementGridHandle } from "@/components/requirements/requirement-grid";
import { useRequirementAssetUpload } from "@/components/requirements/use-requirement-asset-upload";
import { useProductMembers } from "@/hooks/store/use-product-members";
import { useProductRequirements } from "@/hooks/store/use-product-requirements";
import { useRequirementBaselines } from "@/hooks/store/use-requirement-baselines";
import { useRequirementApprovalInbox, useRequirementChangeRequests } from "@/hooks/store/use-requirement-changes";
import { useUser } from "@/hooks/store/user";
import { RequirementBaselinesTab } from "./baseline/requirement-baselines-tab";
import { RequirementChangesTab } from "./change/requirement-changes-tab";
import { ApprovalInboxModal } from "./approval/approval-inbox-modal";
import { SubmitReviewModal } from "./approval/submit-review-modal";
import { useRequirementApprovalActions } from "./approval/use-requirement-approval-actions";
import { RequirementImportFromLibraryModal } from "./import-from-library-modal";
import { RequirementCreateActions } from "./requirement-create-actions";
import {
  DEFAULT_VIEW_KEY,
  getViewKey,
  RequirementDataViewSwitcher,
  resolveRequirementDataView,
  type TRequirementDataView,
} from "./requirement-data-views";
import {
  RequirementPeekOverview,
  RequirementTestCasesSection,
} from "@/components/requirements/requirement-detail";
import { RequirementDefaultViewGrid } from "./requirement-default-view-grid";

const TABS = ["data", "changes", "baselines"] as const;

type TProductRequirementsTab = (typeof TABS)[number];

/**
 * 产品需求页。
 *
 * 审批配置已迁到产品设置「通用」；这里只做数据 / 变更 / 基线。状态与版本长在每一行上。
 */
export const ProductRequirementsPage = observer(function ProductRequirementsPage() {
  const { t } = useTranslation();
  const { workspaceSlug, productId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { members } = useProductMembers(workspaceSlug, productId);
  const { data: currentUser } = useUser();
  const [dataToolbarHost, setDataToolbarHost] = useState<HTMLDivElement | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  /** 鼠标移到「导入」上就开始预热条目，点开时基本无等待 */
  const [shouldPrefetchImport, setShouldPrefetchImport] = useState(false);
  /** 总览视图的建行弹窗。类型在弹窗里选，不再有「先选类型」那一步；类型视图不走这条路 */
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const gridRef = useRef<TRequirementGridHandle | null>(null);
  const [isCreateBaselineOpen, setIsCreateBaselineOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);

  const store = useProductRequirements({ workspaceSlug, productId });
  const policy = store.policy;
  const requestedTab = searchParams.get("tab") as TProductRequirementsTab | null;
  const activeTab: TProductRequirementsTab = requestedTab && TABS.includes(requestedTab) ? requestedTab : "data";
  const openedChangeRequestId = searchParams.get("cr");
  /** 打开的基线；两个都在时进对比视图 */
  const openedBaselineId = searchParams.get("bl");
  const compareBaselineId = searchParams.get("cmp");
  /**
   * 详情抽屉开在哪一条。
   *
   * URL 仍是入口与出口（深链、刷新、贴给别人都要还原得回来），但开合本身走本地态：
   * setSearchParams 是一次真正的路由导航，React Router 会把它裹进 startTransition，
   * 点开与关闭都得等一次低优先级渲染才生效 —— 工作项的 peek 是纯内存态，手感的差别
   * 就出在这一步。URL 留到副作用里补。
   */
  const urlPeekRequirementId = searchParams.get("peek");
  const [peekRequirementId, setPeekRequirement] = useState<string | null>(urlPeekRequirementId);
  /** 能不能录入/修改需求条目。行级的锁由每一行自己的 is_locked 决定 */
  const canEdit = Boolean(policy?.can_edit);
  const changesStore = useRequirementChangeRequests({ workspaceSlug, productId });
  const baselinesStore = useRequirementBaselines({ workspaceSlug, productId });
  /**
   * 待我审批。端点是工作区级的，这里默认收窄到当前产品 —— 站在这个产品的页面上，先关心
   * 这个产品的待办；跨产品的全量在弹窗里翻页看。
   */
  const approvalInbox = useRequirementApprovalInbox({ workspaceSlug, productId });
  const pendingCount = policy?.pending_change_request_count ?? 0;
  const memberOptions = useMemo(() => {
    const byId = new Map<string, IUserLite>();
    members.forEach((membership) => byId.set(membership.member, membership.member_detail));
    policy?.approver_details.forEach((member) => byId.set(member.id, member));
    if (currentUser) byId.set(currentUser.id, currentUser);
    return Array.from(byId.values());
  }, [currentUser, members, policy]);

  const requirementTypes = store.requirementTypes;
  const activeView = useMemo(
    () => resolveRequirementDataView(requirementTypes, searchParams.get("view")),
    [searchParams, requirementTypes]
  );
  const activeType =
    activeView.kind === "requirementType"
      ? requirementTypes.find((item) => item.id === activeView.requirementTypeId)
      : undefined;

  const uploadAsset = useRequirementAssetUpload({
    workspaceSlug: workspaceSlug ?? "",
    entityId: productId ?? "",
  });

  /**
   * 视图与条目过滤保持同步：单类型时也要把过滤设成那个类型，否则会拉到全部行。
   * 依赖只取用到的两个值 —— store 每次渲染都是新对象，整个放进依赖会死循环。
   */
  const { requirementTypeFilter, setRequirementTypeFilter } = store;
  useEffect(() => {
    const nextFilter = activeView.kind === "requirementType" ? activeView.requirementTypeId : undefined;
    if (requirementTypeFilter !== nextFilter) setRequirementTypeFilter(nextFilter);
  }, [activeView, setRequirementTypeFilter, requirementTypeFilter]);

  const setTab = (tab: TProductRequirementsTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    next.delete("cr");
    next.delete("bl");
    next.delete("cmp");
    setSearchParams(next, { replace: true });
  };

  const changeView = (view: TRequirementDataView) => {
    const next = new URLSearchParams(searchParams);
    if (getViewKey(view) === DEFAULT_VIEW_KEY) next.delete("view");
    else next.set("view", getViewKey(view));
    setSearchParams(next, { replace: true });
  };

  /** 最后一次由本地态写出去的 peek。用来把「自己写的」和「外面改的」分开 */
  const syncedPeekRef = useRef(urlPeekRequirementId);

  /**
   * 前进后退、直接改地址栏：这个方向上 URL 是源。
   *
   * 自己写出去的那一次要跳过 —— 否则「点开后立刻关掉」时，先前那次导航晚一步提交回来，
   * 会把已经关掉的抽屉重新弹开。
   */
  useEffect(() => {
    if (urlPeekRequirementId === syncedPeekRef.current) return;
    syncedPeekRef.current = urlPeekRequirementId;
    setPeekRequirement(urlPeekRequirementId);
  }, [urlPeekRequirementId]);

  /** 反方向补 URL。放在副作用里 = 抽屉先画出来，导航晚一帧再发生，不挡开合 */
  useEffect(() => {
    if (urlPeekRequirementId === peekRequirementId) return;
    syncedPeekRef.current = peekRequirementId;
    const next = new URLSearchParams(searchParams);
    if (peekRequirementId) next.set("peek", peekRequirementId);
    else next.delete("peek");
    setSearchParams(next, { replace: true });
  }, [peekRequirementId, urlPeekRequirementId, searchParams, setSearchParams]);

  const openChangeRequest = (changeRequestId: string | null) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "changes");
    if (changeRequestId) next.set("cr", changeRequestId);
    else next.delete("cr");
    setSearchParams(next, { replace: true });
  };

  const openBaseline = (baselineId: string | null, compareToId?: string | null) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "baselines");
    if (baselineId) next.set("bl", baselineId);
    else next.delete("bl");
    if (compareToId) next.set("cmp", compareToId);
    else next.delete("cmp");
    setSearchParams(next, { replace: true });
  };

  const refreshLayer = () => {
    void store.fetchConfiguration().catch(() => undefined);
    void store.fetchRequirements().catch(() => undefined);
    void changesStore.fetchChangeRequests().catch(() => undefined);
    // 提交 / 通过 / 驳回 / 撤回都会改「待我审批」条数，角标不能等整页刷新
    void approvalInbox.fetchInbox({ silent: true }).catch(() => undefined);
  };

  /**
   * Excel 出入口的参数。导出跟随当前视图：类型视图导那一个类型的单 Sheet，默认视图按
   * 需求类型分 Sheet 导全部，搜索与筛选一并带上 —— 所见即所得。
   */
  const excelArgs = useMemo(
    () => ({
      workspaceSlug: workspaceSlug ?? "",
      productId: productId ?? "",
      search: store.search,
      filters: store.filters,
      requirementTypeIds:
        activeView.kind === "requirementType" ? [activeView.requirementTypeId] : undefined,
    }),
    [workspaceSlug, productId, store.search, store.filters, activeView]
  );
  // onImported 刻意不进 memo：refreshLayer 每次渲染都是新的，放进去要么让 memo 失效，
  // 要么捕获一个过期的闭包。导入可能引入本产品此前没引用过的需求类型，配置不重取的话
  // 视图切换器不会出现新 tab
  const excelProps = { ...excelArgs, onImported: refreshLayer };

  const approvalActions = useRequirementApprovalActions({
    changesStore,
    onSettled: refreshLayer,
    onSubmitted: () => setTab("changes"),
  });

  const isLoading = store.isConfigurationLoading || !policy;

  /**
   * 网格状态格的写入口。只在有页面级写权限时给 —— 状态格刻意不跟行级 is_locked / closed
   * 走（closed 行要能重开），所以「能不能改」在这里一次性由 canEdit 决定。
   */
  const onStatusChange = canEdit
    ? (requirementId: string, status: TRequirementItemStatus) => void store.updateStatus(requirementId, status)
    : undefined;

  return (
    <>
      <PageHead title={t("workspace_products.navigation.requirements")} />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        <nav className="flex h-11 shrink-0 items-center gap-2 overflow-hidden border-b border-subtle px-4 md:px-6">
          <div className="min-w-0 flex-1 self-stretch overflow-x-auto">
            <div className="flex h-full min-w-max items-end gap-1">
              {[
                { key: "data" as const, icon: Database, label: t("workspace_products.requirements.tabs.data") },
                { key: "changes" as const, icon: History, label: t("workspace_products.requirements.tabs.changes") },
                {
                  key: "baselines" as const,
                  icon: Layers,
                  label: t("workspace_products.requirements.tabs.baselines"),
                },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setTab(tab.key)}
                    className={cn(
                      "relative flex h-11 items-center gap-1.5 px-3 text-12 transition-colors",
                      activeTab === tab.key
                        ? "font-medium text-accent-primary after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:bg-accent-primary"
                        : "text-secondary hover:text-primary"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {tab.label}
                    {tab.key === "changes" && pendingCount > 0 && (
                      <span className="ml-1 grid size-4 place-items-center rounded-full bg-warning-primary text-10 text-on-color">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 pl-2">
            {(approvalInbox.inbox.pending_count > 0 || isInboxOpen) && (
              <Button variant="secondary" size="lg" onClick={() => setIsInboxOpen(true)}>
                <Inbox className="size-3.5" />
                {t("workspace_products.requirements.inbox.entry")}
                {approvalInbox.inbox.pending_count > 0 && (
                  <span className="ml-1 grid size-4 place-items-center rounded-full bg-warning-primary text-10 text-on-color">
                    {approvalInbox.inbox.pending_count}
                  </span>
                )}
              </Button>
            )}
            {activeTab === "baselines" && !openedBaselineId && canEdit && (
              <Button variant="primary" size="lg" onClick={() => setIsCreateBaselineOpen(true)}>
                {t("workspace_products.requirements.baseline.create")}
              </Button>
            )}
          </div>
        </nav>

        {/* 视图控制自成一行：左边选看哪一类，右边是导入/录入 + 网格工具栏（搜索等） */}
        {activeTab === "data" && requirementTypes.length > 0 && (
          <div className="relative z-20 flex shrink-0 items-center gap-3 border-b border-subtle px-4 py-1.5 md:px-6">
            <RequirementDataViewSwitcher
              requirementTypes={requirementTypes}
              activeKey={getViewKey(activeView)}
              onChange={changeView}
            />
            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              <div ref={setDataToolbarHost} className="flex min-w-0 items-center" />
              {canEdit && (
                <RequirementCreateActions
                  onImportPrefetch={() => setShouldPrefetchImport(true)}
                  onImport={() => setIsImportOpen(true)}
                  onManualEntry={() =>
                    activeView.kind === "requirementType" ? gridRef.current?.addRow() : setIsCreateOpen(true)
                  }
                  excel={excelProps}
                />
              )}
            </div>
          </div>
        )}

        {store.configurationError && !store.configuration ? (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div>
              <p className="text-13 font-medium text-primary">{t("workspace_products.requirements.error.title")}</p>
              <p className="mt-1 text-12 text-secondary">{store.configurationError}</p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => void store.fetchConfiguration().catch(() => undefined)}
              >
                {t("retry")}
              </Button>
            </div>
          </div>
        ) : activeTab === "baselines" ? (
          <RequirementBaselinesTab
            workspaceSlug={workspaceSlug ?? ""}
            productId={productId ?? ""}
            fields={store.configuration?.fields ?? []}
            requirementTypes={requirementTypes}
            canManage={canEdit}
            store={baselinesStore}
            isCreateOpen={isCreateBaselineOpen}
            onCreateOpenChange={setIsCreateBaselineOpen}
            openedBaselineId={openedBaselineId}
            compareToId={compareBaselineId}
            onOpenBaseline={openBaseline}
          />
        ) : activeTab === "changes" ? (
          <RequirementChangesTab
            workspaceSlug={workspaceSlug ?? ""}
            productId={productId ?? ""}
            fields={store.configuration?.fields ?? []}
            members={memberOptions}
            store={changesStore}
            openedChangeRequestId={openedChangeRequestId}
            onOpenChangeRequest={openChangeRequest}
            onSettled={refreshLayer}
          />
        ) : activeTab === "data" ? (
          requirementTypes.length === 0 ? (
            <EmptyStateDetailed
              assetKey="work-item"
              title={t("workspace_products.requirements.data.empty.title")}
              description={t("workspace_products.requirements.data.empty.description")}
              customButton={
                canEdit ? (
                  <RequirementCreateActions
                    onImportPrefetch={() => setShouldPrefetchImport(true)}
                    onImport={() => setIsImportOpen(true)}
                    onManualEntry={() => setIsCreateOpen(true)}
                    excel={excelProps}
                  />
                ) : undefined
              }
            />
          ) : activeView.kind === "default" ? (
            <RequirementDefaultViewGrid
              workspaceSlug={workspaceSlug ?? ""}
              productId={productId ?? ""}
              requirementTypes={requirementTypes}
              requirements={store.requirementsPage.results}
              totalCount={store.requirementsPage.total_count ?? 0}
              perPage={store.perPage}
              nextCursor={store.requirementsPage.next_cursor}
              prevCursor={store.requirementsPage.prev_cursor}
              nextPageResults={store.requirementsPage.next_page_results}
              prevPageResults={store.requirementsPage.prev_page_results}
              isLoading={isLoading || store.isRequirementsLoading}
              isMutating={store.isMutating}
              error={store.requirementsError}
              readOnly={!canEdit}
              search={store.search}
              filters={store.filters}
              onSearchChange={store.setSearch}
              onFiltersChange={store.setFilters}
              onCursorChange={store.setCursor}
              onPerPageChange={store.setPerPage}
              onDelete={store.deleteRequirements}
              onDuplicate={({ requirementTypeId, data, afterId }) =>
                store.createRequirement(data, requirementTypeId, { after_id: afterId })
              }
              onOpenRequirementTypeView={(requirementTypeId) =>
                changeView({ kind: "requirementType", requirementTypeId })
              }
              onOpenDetail={setPeekRequirement}
              onOpenChangeRequest={openChangeRequest}
              onSubmitReview={approvalActions.openSubmitModal}
              onWithdrawReview={approvalActions.withdraw}
              onStatusChange={onStatusChange}
              toolbarPortalEl={dataToolbarHost}
            />
          ) : (
            <RequirementGrid
              ref={gridRef}
              // 按视图重挂：列显隐、勾选、筛选弹层都随之重置，避免跨视图串味
              key={activeView.requirementTypeId}
              workspaceSlug={workspaceSlug ?? ""}
              entityId={productId ?? ""}
              entityKind="product"
              showApprovalColumn
              readOnly={!canEdit}
              createRequirementTypeId={activeView.requirementTypeId}
              columnStorageId={activeView.requirementTypeId}
              fields={activeType?.fields ?? []}
              /*
               * 列已经换成新类型了，行还得等 requirementTypeFilter 同步过去（那是个
               * effect，比这次渲染晚一拍）。这一拍里先按空列表渲染，让网格照常走骨架屏 ——
               * 否则会闪出「新类型的列配上一个视图的行」。
               */
              requirements={
                store.requirementTypeFilter === activeView.requirementTypeId ? store.requirementsPage.results : []
              }
              totalCount={store.requirementsPage.total_count ?? 0}
              totalPages={store.requirementsPage.total_pages ?? 0}
              nextCursor={store.requirementsPage.next_cursor}
              prevCursor={store.requirementsPage.prev_cursor}
              nextPageResults={store.requirementsPage.next_page_results}
              prevPageResults={store.requirementsPage.prev_page_results}
              isLoading={isLoading || store.isRequirementsLoading}
              isMutating={store.isMutating}
              error={store.requirementsError}
              search={store.search}
              filters={store.filters}
              perPage={store.perPage}
              onSearchChange={store.setSearch}
              onFiltersChange={store.setFilters}
              onPerPageChange={store.setPerPage}
              onCursorChange={store.setCursor}
              onRefresh={store.fetchRequirements}
              onBulkSave={store.saveRequirementBatch}
              onOpenDetail={setPeekRequirement}
              onSubmitReview={approvalActions.openSubmitModal}
              onWithdrawReview={approvalActions.withdraw}
              onOpenChangeRequest={openChangeRequest}
              onStatusChange={onStatusChange}
              toolbarPortalEl={dataToolbarHost}
            />
          )
        ) : null}
      </ContentWrapper>

      <RequirementPeekOverview
        workspaceSlug={workspaceSlug ?? ""}
        productId={productId ?? ""}
        requirementId={peekRequirementId}
        requirementTypes={requirementTypes}
        rows={store.requirementsPage.results}
        canEdit={canEdit}
        onClose={() => setPeekRequirement(null)}
        onOpenRequirement={setPeekRequirement}
        // 抽屉已经把改完的整行交回来了（内容 PATCH 与状态改动都走这条），直接合并进当前页；
        // 重拉会让后面的网格整张闪一下
        onRequirementUpdated={(requirement) => store.syncRequirements([requirement])}
        /*
         * 关联测试用例：权限语境与产品侧整页完全相同（都在 products/{productId} 下、
         * 都用同一个 canEdit），所以抽屉与整页一样给可写变体。关联工作项恰好相反 ——
         * 那个要项目语境，产品侧抽屉不注入。
         */
        testCasesSection={
          peekRequirementId ? (
            <RequirementTestCasesSection
              workspaceSlug={workspaceSlug ?? ""}
              productId={productId ?? ""}
              requirementId={peekRequirementId}
              canManage={canEdit}
            />
          ) : null
        }
      />

      {/*
        常驻挂载（不加 isImportOpen && 门槛）：内部的 hook 会在挂载时把标准库列表拉好，
        换来「打开即有内容」。代价是进页面多一个很轻的列表请求，比打开后白屏 1 秒划算。
        条目那一层更重，所以留给 shouldPrefetch 在 hover 时再拉。
      */}
      <RequirementImportFromLibraryModal
        isOpen={isImportOpen}
        shouldPrefetch={shouldPrefetchImport}
        workspaceSlug={workspaceSlug ?? ""}
        isMutating={store.isMutating}
        onClose={() => setIsImportOpen(false)}
        onImport={async (payloads) => {
          const responses = await store.importFromLibraries(payloads);
          if (!responses.length) return responses;
          // 跨库导入时切到第一批的类型视图，用户马上能看到刚导进来的数据
          changeView({ kind: "requirementType", requirementTypeId: responses[0].requirement_type_id });
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: t("success"),
            message: t("workspace_products.requirements.data.toast.imported", {
              count: responses.reduce((total, item) => total + item.created.length, 0),
            }),
          });
          return responses;
        }}
      />
      {/* 总览视图专用：类型在弹窗里选，字段跟着切，一次落库，人不用离开总览 */}
      {isCreateOpen && (
        <RequirementCreateModal
          isOpen
          workspaceSlug={workspaceSlug ?? ""}
          entityId={productId ?? ""}
          entityKind="product"
          allowTypeSelection
          onClose={() => setIsCreateOpen(false)}
          onSave={store.saveRequirementBatch}
          onUpload={uploadAsset}
        />
      )}

      <SubmitReviewModal
        isOpen={approvalActions.isSubmitModalOpen}
        isSubmitting={changesStore.isMutating}
        onClose={approvalActions.closeSubmitModal}
        onSubmit={(reason) => void approvalActions.submit(reason)}
      />

      <ApprovalInboxModal
        isOpen={isInboxOpen}
        inbox={approvalInbox}
        onClose={() => setIsInboxOpen(false)}
        onSettled={refreshLayer}
        onOpenChangeRequest={(item) => {
          setIsInboxOpen(false);
          // 收件箱是跨产品的：别的产品的单要整页跳过去，不能只改当前页的 query
          if (item.product_id === productId) openChangeRequest(item.id);
          else
            navigate(
              `/${workspaceSlug}/products/${item.product_id}/requirements?tab=changes&cr=${item.id}`
            );
        }}
      />
    </>
  );
});
