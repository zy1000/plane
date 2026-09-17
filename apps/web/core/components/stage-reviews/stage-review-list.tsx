import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck, SearchX } from "lucide-react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { IUserLite, TStageReview } from "@plane/types";
import { COLLECTION_OPERATOR, EStageReviewStatus, LOGICAL_OPERATOR } from "@plane/types";
import { Loader } from "@plane/ui";
import { toFilterArray } from "@plane/utils";
import { CountChip } from "@/components/common/count-chip";
import { PageSearchInput } from "@/components/pages/list/search-input";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import { PROJECT_ME_INFORMATION } from "@/constants/fetch-keys";
import { useStageReviews } from "@/hooks/store/use-stage-reviews";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { StageReviewBulkBar } from "./bulk/stage-review-bulk-bar";
import { StageReviewBulkEditPanel } from "./bulk/stage-review-bulk-edit-panel";
import { useStageReviewBulkEdit } from "./bulk/use-stage-review-bulk-edit";
import { useStageReviewSelection } from "./bulk/use-stage-review-selection";
import { StageReviewDrawer } from "./detail/stage-review-drawer";
import { StageReviewDisplayDropdown } from "./display/display-dropdown";
import type { TStageReviewColumn } from "./display/display-settings";
import { getStageReviewDisplayProperties, useStageReviewDisplay } from "./display/display-settings";
import { stageReviewMatchesConditions } from "./filters/match-stage-review";
import { useStageReviewFilter } from "./filters/use-stage-review-filter";
import { useStageReviewFiltersConfig } from "./filters/use-stage-review-filters-config";
import { StageReviewGroupSidebar } from "./group-sidebar/group-sidebar";
import { useStageReviewGrouping } from "./group-sidebar/use-stage-review-grouping";
import { STAGE_REVIEWS_HEADER_ACTIONS_ID, STAGE_REVIEWS_HEADER_COUNT_ID } from "./header-slots";
import { useStageReviewPermissions } from "./permissions";
import { ProductStageReviewsEmptyState } from "./product-empty-state";
import type { TStageReviewScope } from "./scope";
import { getStageReviewScopeId, getStageReviewStorageScope } from "./scope";
import { STAGE_REVIEW_GROUP_ALL, stageReviewGroupKey } from "./stage-review-rows";
import type { TStageReviewTableSelection } from "./stage-review-table";
import { StageReviewTable } from "./stage-review-table";
import { StageReviewSummary } from "./stage-summary";

const I18N = "stage_review";

/**
 * 阶段评审列表，布局照工作项：左侧分组栏（「显示 → 分组方式」决定按什么分，默认研发阶段；
 * 选「无」不出分组栏），右侧是选中那一组的摘要 + 按属性列出的评审表；点一行开右侧抽屉。
 *
 * 页头的搜索 / 筛选 / 显示照工作项：筛选是页头下方的筛选行，显示是「显示属性 / 分组方式 /
 * 排序方式 / 显示评审活动 / 显示空组」。**评审只由裁剪表生成**，这里没有新建与删除；被裁剪
 * 掉的评审也不会出现，它们在裁剪表里带着原因存档。
 *
 * 两个作用域共用这一个组件（见 `scope.ts`）：项目页「产品」是列与分组维；产品页换成「项目」，
 * 按项目分组时「项目」列换成「研发阶段」列，左栏与摘要标出产品的当前阶段。
 *
 * URL 带 `?review=<id>` 时，数据到手后自动选中它所在的组并打开抽屉（产品页「在项目中打开」用）。
 */
export const StageReviewList = observer(function StageReviewList({
  workspaceSlug,
  scope,
}: {
  workspaceSlug: string;
  scope: TStageReviewScope;
}) {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { fetchUserProjectInfo } = useUserPermissions();
  const { getWorkspaceBySlug } = useWorkspace();
  const searchParams = useSearchParams();

  const scopeKind = scope.kind;
  const scopeId = getStageReviewScopeId(scope);
  const storageScope = getStageReviewStorageScope(scope);
  const currentStageId = scope.kind === "product" ? scope.currentStageId : null;

  const { stages, reviews, linkedProjectIds, isLoading, error, applyReview, applyReviews } = useStageReviews(
    workspaceSlug,
    scopeKind,
    scopeId
  );

  const [search, setSearch] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  const [countHost, setCountHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setActionsHost(document.getElementById(STAGE_REVIEWS_HEADER_ACTIONS_ID));
    setCountHost(document.getElementById(STAGE_REVIEWS_HEADER_COUNT_ID));
  }, []);

  // 抽屉里的读写一律落在这条评审自己的项目上；项目页就是页面的项目
  const openReview = openReviewId ? reviews.find((review) => review.id === openReviewId) : undefined;
  const drawerProjectId = scope.kind === "project" ? scope.projectId : (openReview?.project_id ?? "");

  // 项目权限 key 只在进过那个项目后才有（project-wrapper 拉的）；产品页打开别的项目的评审时
  // 按同一个 SWR 键补拉一次，否则动作条会一直当成没权限
  useSWR(
    scopeKind === "product" && drawerProjectId ? PROJECT_ME_INFORMATION(workspaceSlug, drawerProjectId) : null,
    () => fetchUserProjectInfo(workspaceSlug, drawerProjectId)
  );
  const { canManage } = useStageReviewPermissions(workspaceSlug, drawerProjectId);

  const { settings, updateSettings } = useStageReviewDisplay(storageScope, scopeKind, currentUser?.id);
  const { areAllConfigsInitialized, configs } = useStageReviewFiltersConfig({
    reviews,
    workspaceSlug,
    currentUser: currentUser as IUserLite | undefined,
    scopeKind,
  });
  const filter = useStageReviewFilter({ areAllConfigsInitialized, configs, storageScope });
  const conditions = filter.allConditionsForDisplay;

  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const isHit = useCallback(
    (review: TStageReview) => {
      const keyword = search.trim().toLowerCase();
      return (
        (!keyword || review.title.toLowerCase().includes(keyword)) &&
        stageReviewMatchesConditions(review, conditions, currentUser?.id)
      );
    },
    [search, conditions, currentUser?.id]
  );

  const { sidebarGroups, rowsOf, reviewsOf } = useStageReviewGrouping({
    reviews,
    stages,
    isHit,
    settings,
    currentStageId,
  });

  // `?review=<id>`：只在第一次拿到数据时生效，之后用户自己点的不被它顶掉
  const deepLinkReviewId = searchParams?.get("review") ?? null;
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || !deepLinkReviewId || reviews.length === 0) return;
    deepLinkHandled.current = true;
    const target = reviews.find((review) => review.id === deepLinkReviewId);
    if (!target) return;
    setSelectedGroupId(stageReviewGroupKey(settings.groupBy, target));
    setOpenReviewId(target.id);
  }, [deepLinkReviewId, reviews, settings.groupBy]);

  // 选中的组不在当前分组栏里（切了分组方式、被筛没了）就落到第一组（「全部评审」），同工作项
  const isGrouped = settings.groupBy !== "none";
  const activeGroup = isGrouped
    ? (sidebarGroups.find((group) => group.id === selectedGroupId) ?? sidebarGroups[0] ?? null)
    : null;
  // 选「全部评审」时右侧按不分组的口径列、列也按不分组出
  const effectiveGroupBy = isGrouped && activeGroup?.id !== STAGE_REVIEW_GROUP_ALL ? settings.groupBy : "none";
  const rows = isGrouped ? rowsOf(activeGroup?.id ?? null) : rowsOf(null);
  const summaryReviews = isGrouped ? (activeGroup ? reviewsOf(activeGroup.id) : []) : reviews;
  const summaryLabel = isGrouped ? (activeGroup?.name ?? "") : t(`${I18N}.list.all_reviews`);
  // 标题下那行数什么：项目页数产品；产品页数项目，按项目分组时一组只有一个项目，改数阶段
  const summaryMeta = scopeKind === "project" ? "products" : effectiveGroupBy === "project" ? "stages" : "projects";

  // 列 = 这个作用域下开着的显示属性；产品页按项目分组时「项目」列换成「研发阶段」列。
  // 右侧只列选中那一组，当前分组维度那一列整列都是同一个值，藏掉（按产品分组时不出「产品」列）
  const columns = useMemo<TStageReviewColumn[]>(() => {
    const visible = getStageReviewDisplayProperties(scopeKind).filter((property) => settings.properties[property]);
    const swapped =
      scopeKind === "product" && effectiveGroupBy === "project"
        ? visible.map((property): TStageReviewColumn => (property === "project" ? "stage" : property))
        : visible;
    return swapped.filter((column) => column !== effectiveGroupBy);
  }, [scopeKind, settings.properties, effectiveGroupBy]);
  // 批量改属性只在项目页、有维护权限时开：批量接口是项目级的，产品页的评审横跨多个项目。
  // 已评审是终态不能勾；「能勾的行」随分组 / 筛选 / 搜索变化，勾选跟着收窄
  const canBulkEdit = scope.kind === "project" && canManage;
  const selectableKey = canBulkEdit
    ? rows
        .filter(({ review }) => review.status !== EStageReviewStatus.COMPLETED)
        .map(({ review }) => review.id)
        .join(",")
    : "";
  const selectableIds = useMemo(() => (selectableKey ? selectableKey.split(",") : []), [selectableKey]);
  const selection = useStageReviewSelection(selectableIds);
  const bulkEdit = useStageReviewBulkEdit({
    workspaceSlug,
    projectId: scope.kind === "project" ? scope.projectId : "",
    selectedIds: selection.selectedIds,
    replaceSelection: selection.replace,
    applyReviews,
  });
  const tableSelection: TStageReviewTableSelection | undefined = canBulkEdit
    ? {
        selectedSet: selection.selectedSet,
        allSelected: selection.allSelected,
        someSelected: selection.someSelected,
        isSelectable: (review) => review.status !== EStageReviewStatus.COMPLETED,
        onToggle: selection.toggle,
        onToggleAll: selection.toggleAll,
      }
    : undefined;

  const stageLabelById = useMemo(() => new Map(stages.map((stage) => [stage.stage_id, stage.label])), [stages]);
  const stageLabelOf = useCallback((stageId: string) => stageLabelById.get(stageId), [stageLabelById]);

  // 摘要图例与筛选行里的「状态」是同一个条件
  const statusCondition = conditions.find((condition) => condition.property === "status");
  const activeStatuses = (toFilterArray(statusCondition?.value as never) ?? []).map(String) as EStageReviewStatus[];

  const handleToggleStatus = (status: EStageReviewStatus) => {
    if (!statusCondition) {
      filter.addCondition(
        LOGICAL_OPERATOR.AND,
        { property: "status", operator: COLLECTION_OPERATOR.IN, value: [status] },
        false
      );
      filter.toggleVisibility(true);
      return;
    }
    const next = activeStatuses.includes(status)
      ? activeStatuses.filter((value) => value !== status)
      : [...activeStatuses, status];
    if (next.length === 0) filter.removeCondition(statusCondition.id);
    else filter.updateConditionValue(statusCondition.id, next);
  };

  const handleClearAll = () => {
    setSearch("");
    void filter.clearFilters();
  };

  if (isLoading) {
    return (
      <Loader className="flex h-full gap-4 p-4">
        <Loader.Item height="100%" width="240px" />
        <div className="flex flex-1 flex-col gap-3">
          <Loader.Item height="96px" />
          <Loader.Item height="320px" />
        </div>
      </Loader>
    );
  }

  if (error) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-14 font-medium text-primary">{t(`${I18N}.error_title`)}</p>
          <p className="mt-1 text-12 text-tertiary">{error}</p>
        </div>
      </div>
    );
  }

  // 产品页一条评审都没有：整页空态，直接把人送到评审的来源（关联项目 / 评审裁剪）
  if (scope.kind === "product" && reviews.length === 0) {
    return (
      <ProductStageReviewsEmptyState
        workspaceSlug={workspaceSlug}
        productId={scope.productId}
        linkedProjectIds={linkedProjectIds}
      />
    );
  }

  const renderBody = () => {
    if (reviews.length === 0) {
      return (
        <div className="grid h-full place-items-center px-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <ClipboardCheck className="size-8 text-tertiary" />
            <p className="text-14 font-medium text-primary">{t(`${I18N}.empty.title`)}</p>
            <p className="max-w-80 text-12 leading-relaxed text-tertiary">{t(`${I18N}.empty.description`)}</p>
          </div>
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="grid h-full place-items-center px-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <SearchX className="size-8 text-tertiary" />
            <p className="text-14 font-medium text-primary">{t(`${I18N}.list.empty_filtered_title`)}</p>
            <p className="max-w-80 text-12 leading-relaxed text-tertiary">
              {t(`${I18N}.list.empty_filtered_description`)}
            </p>
            <Button variant="secondary" size="sm" className="mt-1" onClick={handleClearAll}>
              {t(`${I18N}.list.clear_filters`)}
            </Button>
          </div>
        </div>
      );
    }
    return (
      <StageReviewTable
        workspaceSlug={workspaceSlug}
        rows={rows}
        columns={columns}
        stageLabelOf={stageLabelOf}
        today={today}
        activeReviewId={openReviewId}
        onOpen={setOpenReviewId}
        selection={tableSelection}
        flashedCells={bulkEdit.flashedCells}
      />
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FiltersRow filter={filter} />

      <div className="flex min-h-0 flex-1">
        {isGrouped && (
          <StageReviewGroupSidebar
            groupBy={settings.groupBy}
            groups={sidebarGroups}
            selectedGroupId={activeGroup?.id ?? null}
            onSelectGroup={setSelectedGroupId}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {(!isGrouped || activeGroup) && reviews.length > 0 && (
            <StageReviewSummary
              label={summaryLabel}
              reviews={summaryReviews}
              meta={summaryMeta}
              isCurrentStage={Boolean(activeGroup?.isCurrent)}
              activeStatuses={activeStatuses}
              onToggleStatus={handleToggleStatus}
            />
          )}
          <div className="min-h-0 flex-1 overflow-auto">{renderBody()}</div>
          {canBulkEdit && scope.kind === "project" && (
            <div className="relative">
              <StageReviewBulkBar
                selectedCount={selection.selectedIds.length}
                onClearSelection={selection.clear}
                isEditPanelOpen={bulkEdit.isPanelOpen}
                onToggleEditPanel={bulkEdit.togglePanel}
                editPanel={
                  <StageReviewBulkEditPanel
                    projectId={scope.projectId}
                    selectedCount={selection.selectedIds.length}
                    submitting={bulkEdit.submitting}
                    onCancel={bulkEdit.closePanel}
                    onApply={(changes) => void bulkEdit.apply(changes)}
                  />
                }
              />
            </div>
          )}
        </div>
      </div>

      <StageReviewDrawer
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        projectId={drawerProjectId}
        reviewId={drawerProjectId ? openReviewId : null}
        canManage={canManage}
        currentUserId={currentUser?.id}
        showProjectCrumb={scopeKind === "product"}
        onClose={() => setOpenReviewId(null)}
        onUpdated={applyReview}
      />

      {actionsHost &&
        createPortal(
          <>
            <PageSearchInput
              searchQuery={search}
              updateSearchQuery={setSearch}
              placeholder={t(`${I18N}.list.search_placeholder`)}
            />
            <FiltersToggle filter={filter} enableQuickAddFilter={false} />
            <StageReviewDisplayDropdown scopeKind={scopeKind} settings={settings} onChange={updateSettings} />
          </>,
          actionsHost
        )}
      {countHost && reviews.length > 0 && createPortal(<CountChip count={reviews.length} />, countHost)}
    </div>
  );
});
