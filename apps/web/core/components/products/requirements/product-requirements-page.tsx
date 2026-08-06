import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Database, History, Inbox, Layers, Save, Settings2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementApprovalPolicy, IUserLite } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { RequirementGrid } from "@/components/requirements/requirement-grid";
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
import {
  DEFAULT_VIEW_KEY,
  getViewKey,
  RequirementDataViewSwitcher,
  resolveRequirementDataView,
  type TRequirementDataView,
} from "./requirement-data-views";
import { RequirementPeekOverview } from "@/components/requirements/requirement-detail";
import { RequirementDefaultViewGrid } from "./requirement-default-view-grid";
import { RequirementSettingsPanel, type TRequirementSettingsDraft } from "./requirement-settings-panel";
import { RequirementTypePickerModal } from "./requirement-type-picker-modal";

const TABS = ["data", "configuration", "changes", "baselines"] as const;

type TProductRequirementsTab = (typeof TABS)[number];

const toSettingsDraft = (policy: TRequirementApprovalPolicy): TRequirementSettingsDraft => ({
  owner_id: policy.owner_id,
  approver_ids: policy.approver_ids,
  approval_type: policy.approval_type,
  required_count: policy.required_count,
});

const serializeSettings = (settings: TRequirementSettingsDraft) => JSON.stringify(settings);

/**
 * 产品需求页。
 *
 * 审批的单位是**一条需求**，所以页面级只剩「谁能批」这份配置；状态与版本都长在每一行
 * 上。整个产品不再有只读闸门 —— A 提交了需求 A 的评审，B 照样可以改需求 B。
 */
export const ProductRequirementsPage = observer(function ProductRequirementsPage() {
  const { t } = useTranslation();
  const { workspaceSlug, productId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { members } = useProductMembers(workspaceSlug, productId);
  const { data: currentUser } = useUser();
  const [isDataEditing, setIsDataEditing] = useState(false);
  const [dataToolbarHost, setDataToolbarHost] = useState<HTMLDivElement | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  /** 鼠标移到「导入」上就开始预热条目，点开时基本无等待 */
  const [shouldPrefetchImport, setShouldPrefetchImport] = useState(false);
  const [isTypePickerOpen, setIsTypePickerOpen] = useState(false);
  const [isCreateBaselineOpen, setIsCreateBaselineOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<TRequirementSettingsDraft | null>(null);
  const [settingsBaseline, setSettingsBaseline] = useState("");

  const store = useProductRequirements({ workspaceSlug, productId });
  const policy = store.policy;
  const requestedTab = searchParams.get("tab") as TProductRequirementsTab | null;
  const activeTab: TProductRequirementsTab = requestedTab && TABS.includes(requestedTab) ? requestedTab : "data";
  const openedChangeRequestId = searchParams.get("cr");
  /** 打开的基线；两个都在时进对比视图 */
  const openedBaselineId = searchParams.get("bl");
  const compareBaselineId = searchParams.get("cmp");
  /** 详情抽屉开在哪一条。走 URL 而不是内存态：需求经常要贴链接给别人 */
  const peekRequirementId = searchParams.get("peek");
  /** 能不能录入/修改需求条目。行级的锁由每一行自己的 is_locked 决定 */
  const canEdit = Boolean(policy?.can_edit);
  /** 能不能改审批配置本身 —— 必然比 canEdit 窄 */
  const canManagePolicy = Boolean(policy?.can_manage);
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
    if (policy?.owner_detail) byId.set(policy.owner_id, policy.owner_detail);
    policy?.approver_details.forEach((member) => byId.set(member.id, member));
    if (currentUser) byId.set(currentUser.id, currentUser);
    return Array.from(byId.values());
  }, [currentUser, members, policy]);
  const isDirty = useMemo(
    () => Boolean(settingsBaseline && settingsDraft && serializeSettings(settingsDraft) !== settingsBaseline),
    [settingsBaseline, settingsDraft]
  );

  const requirementTypes = store.requirementTypes;
  const activeView = useMemo(
    () => resolveRequirementDataView(requirementTypes, searchParams.get("view")),
    [searchParams, requirementTypes]
  );
  const activeType =
    activeView.kind === "requirementType"
      ? requirementTypes.find((item) => item.id === activeView.requirementTypeId)
      : undefined;

  useEffect(() => {
    if (!store.configuration) return;
    const nextSettings = toSettingsDraft(store.configuration.policy);
    setSettingsDraft(nextSettings);
    setSettingsBaseline(serializeSettings(nextSettings));
  }, [store.configuration]);

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
    if (isDataEditing || (activeTab === "configuration" && isDirty)) return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    next.delete("cr");
    next.delete("bl");
    next.delete("cmp");
    setSearchParams(next, { replace: true });
  };

  const changeView = (view: TRequirementDataView) => {
    if (isDataEditing) return;
    const next = new URLSearchParams(searchParams);
    if (getViewKey(view) === DEFAULT_VIEW_KEY) next.delete("view");
    else next.set("view", getViewKey(view));
    setSearchParams(next, { replace: true });
  };

  const setPeekRequirement = (requirementId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (requirementId) next.set("peek", requirementId);
    else next.delete("peek");
    setSearchParams(next, { replace: true });
  };

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
  };

  const approvalActions = useRequirementApprovalActions({
    changesStore,
    onSettled: refreshLayer,
    onSubmitted: () => setTab("changes"),
  });

  /** 只保存负责人与审批配置 —— 字段归需求类型，标题描述归每一条需求 */
  const saveConfiguration = async () => {
    if (!store.configuration || !settingsDraft) return;
    if (!settingsDraft.owner_id) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_products.requirements.validation.owner"),
      });
      return;
    }
    if (
      settingsDraft.approver_ids.length > 0 &&
      settingsDraft.approval_type === "n_of_m" &&
      (!settingsDraft.required_count ||
        settingsDraft.required_count < 1 ||
        settingsDraft.required_count > settingsDraft.approver_ids.length)
    ) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_products.requirements.validation.required_count"),
      });
      return;
    }
    try {
      const response = await store.updateConfiguration({
        expected_updated_at: store.configuration.policy.updated_at,
        policy: {
          owner_id: settingsDraft.owner_id,
          approver_ids: settingsDraft.approver_ids,
          approval_type: settingsDraft.approver_ids.length ? settingsDraft.approval_type : "any",
          required_count:
            settingsDraft.approver_ids.length && settingsDraft.approval_type === "n_of_m"
              ? settingsDraft.required_count
              : null,
        },
      });
      const nextSettings = toSettingsDraft(response.policy);
      setSettingsDraft(nextSettings);
      setSettingsBaseline(serializeSettings(nextSettings));
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_products.requirements.toast.configuration_saved"),
      });
    } catch (error) {
      const payload = error as { code?: string; error?: string };
      if (payload?.code === "REQUIREMENT_CONFIGURATION_CONFLICT") {
        await store.fetchConfiguration().catch(() => undefined);
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("workspace_products.requirements.toast.failed"),
      });
    }
  };

  const isLoading = store.isConfigurationLoading || !policy;

  return (
    <>
      <PageHead title={t("workspace_products.navigation.requirements")} />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        <nav className="flex h-11 shrink-0 items-center gap-2 overflow-hidden border-b border-subtle px-4 md:px-6">
          <div className="min-w-0 flex-1 self-stretch overflow-x-auto">
            <div className="flex h-full min-w-max items-end gap-1">
              {[
                {
                  key: "configuration" as const,
                  icon: Settings2,
                  label: t("workspace_products.requirements.tabs.configuration"),
                },
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
                    disabled={isDataEditing || (activeTab === "configuration" && isDirty)}
                    onClick={() => setTab(tab.key)}
                    className={cn(
                      "relative flex h-11 items-center gap-1.5 px-3 text-12 transition-colors disabled:cursor-not-allowed disabled:opacity-60",
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
            {activeTab === "data" && canEdit && !isDataEditing && (
              <>
                <Button
                  variant="secondary"
                  size="lg"
                  onMouseEnter={() => setShouldPrefetchImport(true)}
                  onFocus={() => setShouldPrefetchImport(true)}
                  onClick={() => setIsImportOpen(true)}
                >
                  {t("workspace_products.requirements.data.import_from_library")}
                </Button>
                <Button variant="primary" size="lg" onClick={() => setIsTypePickerOpen(true)}>
                  {t("workspace_products.requirements.data.manual_entry")}
                </Button>
              </>
            )}
            {activeTab === "baselines" && !openedBaselineId && canEdit && (
              <Button variant="primary" size="lg" onClick={() => setIsCreateBaselineOpen(true)}>
                <Layers className="size-3.5" />
                {t("workspace_products.requirements.baseline.create")}
              </Button>
            )}
            {activeTab === "configuration" && canManagePolicy && (
              <Button
                variant="primary"
                size="lg"
                disabled={!isDirty}
                loading={store.isMutating}
                onClick={() => void saveConfiguration()}
              >
                <Save className="size-3.5" />
                {t("workspace_products.requirements.configuration.save")}
              </Button>
            )}
          </div>
        </nav>

        {/* 视图控制自成一行：左边选看哪一类，右边是网格自己的工具栏（搜索、编辑态的保存/取消） */}
        {activeTab === "data" && requirementTypes.length > 0 && (
          <div className="flex shrink-0 items-center gap-3 border-b border-subtle px-4 py-1.5 md:px-6">
            <RequirementDataViewSwitcher
              requirementTypes={requirementTypes}
              activeKey={getViewKey(activeView)}
              disabled={isDataEditing}
              onChange={changeView}
            />
            <div ref={setDataToolbarHost} className="ml-auto flex min-w-0 items-center" />
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
            onSettled={() => {
              refreshLayer();
              void changesStore.fetchChangeRequests().catch(() => undefined);
            }}
          />
        ) : activeTab === "data" ? (
          requirementTypes.length === 0 ? (
            <div className="grid flex-1 place-items-center p-6 text-center">
              <div className="max-w-md">
                <p className="text-13 font-medium text-primary">
                  {t("workspace_products.requirements.data.empty.title")}
                </p>
                <p className="mt-1 text-12 text-secondary">
                  {t("workspace_products.requirements.data.empty.description")}
                </p>
                {canEdit && (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <Button
                      variant="primary"
                      onMouseEnter={() => setShouldPrefetchImport(true)}
                      onFocus={() => setShouldPrefetchImport(true)}
                      onClick={() => setIsImportOpen(true)}
                    >
                      {t("workspace_products.requirements.data.import_from_library")}
                    </Button>
                    <Button variant="secondary" onClick={() => setIsTypePickerOpen(true)}>
                      {t("workspace_products.requirements.data.manual_entry")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
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
              onSearchChange={store.setSearch}
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
              toolbarPortalEl={dataToolbarHost}
            />
          ) : (
            <RequirementGrid
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
              requirements={store.requirementsPage.results}
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
              onEditingChange={setIsDataEditing}
              onOpenDetail={setPeekRequirement}
              onSubmitReview={approvalActions.openSubmitModal}
              onWithdrawReview={approvalActions.withdraw}
              onOpenChangeRequest={openChangeRequest}
              toolbarPortalEl={dataToolbarHost}
            />
          )
        ) : store.isConfigurationLoading ? (
          <div className="p-6">
            <Loader>
              <Loader.Item height="420px" />
            </Loader>
          </div>
        ) : (
          /* 配置只剩负责人与审批 —— 字段由「需求类型」维护，标题描述在每条需求上 */
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-subtle px-4 py-2 text-11 text-tertiary md:px-6">
              {t("workspace_products.requirements.configuration.fields_moved_hint")}
            </div>
            <div className="flex min-h-0 flex-1">
              {settingsDraft ? (
                <RequirementSettingsPanel
                  draft={settingsDraft}
                  readOnly={!canManagePolicy}
                  memberOptions={memberOptions}
                  onChange={setSettingsDraft}
                />
              ) : (
                <div className="min-w-0 flex-1 p-6">
                  <Loader>
                    <Loader.Item height="420px" />
                  </Loader>
                </div>
              )}
            </div>
          </div>
        )}
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
        onRequirementUpdated={() => void store.fetchRequirements()}
        onSubmitReview={(requirementId) => approvalActions.openSubmitModal([requirementId])}
        onWithdrawReview={approvalActions.withdraw}
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
      {isTypePickerOpen && (
        <RequirementTypePickerModal
          isOpen={isTypePickerOpen}
          workspaceSlug={workspaceSlug ?? ""}
          onClose={() => setIsTypePickerOpen(false)}
          onConfirm={(requirementTypeId) => {
            setIsTypePickerOpen(false);
            // 切到该需求类型的视图，用户在那里用表格下方的「新增数据」录入
            changeView({ kind: "requirementType", requirementTypeId });
          }}
        />
      )}

      <SubmitReviewModal
        isOpen={approvalActions.isSubmitModalOpen}
        isSubmitting={changesStore.isMutating}
        requirements={approvalActions.pendingSelection.map(
          (id) => store.requirementsPage.results.find((row) => row.id === id) ?? null
        )}
        onClose={approvalActions.closeSubmitModal}
        onSubmit={(reason) => void approvalActions.submit(reason)}
      />

      <ApprovalInboxModal
        isOpen={isInboxOpen}
        inbox={approvalInbox}
        onClose={() => setIsInboxOpen(false)}
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
