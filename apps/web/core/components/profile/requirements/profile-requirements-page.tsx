/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "react-router";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TProfileRequirementFacets } from "@plane/types";
import { cn } from "@plane/utils";
// components
import {
  applyListQueryToSearchParams,
  listQueryToExpression,
  parseListQueryFromSearchParams,
  projectRequirementExpressionToQuery,
  serializeListQuery,
  useProjectRequirementFilter,
  useProjectRequirementFiltersConfig,
} from "@/components/projects/requirements/filters";
import type { TProjectRequirementFilterExpression } from "@/components/projects/requirements/filters";
import {
  PRODUCT_PARAM,
  getProductFromParam,
} from "@/components/projects/requirements/project-requirement-product-tabs";
import { ProjectRequirementsGrid } from "@/components/projects/requirements/project-requirements-grid";
import { RequirementPeekOverview } from "@/components/requirements/requirement-detail";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
// hooks
import { useProfileRequirements } from "@/hooks/store/use-profile-requirements";

const noop = () => undefined;

/** 顶部产品范围条：一个人可能负责多个产品的需求，只有一个产品时不显示 */
function ProductScopeTabs({
  facets,
  onSelect,
  selectedProductId,
}: {
  facets: TProfileRequirementFacets | null;
  onSelect: (productId: string | null) => void;
  selectedProductId: string | null;
}) {
  const { t } = useTranslation();
  const products = facets?.by_product ?? [];
  if (products.length < 2) return null;

  const tabClassName = (active: boolean) =>
    cn(
      "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-12 transition-colors",
      active ? "bg-accent-subtle font-medium text-accent-primary" : "text-secondary hover:bg-layer-1 hover:text-primary"
    );

  return (
    <div className="horizontal-scrollbar scrollbar-sm flex items-center gap-1 overflow-x-auto border-b border-subtle px-4 py-2">
      <button type="button" className={tabClassName(selectedProductId === null)} onClick={() => onSelect(null)}>
        {t("profile.stats.requirements.all_products")}
        <span className="text-11 text-placeholder tabular-nums">{facets?.total ?? 0}</span>
      </button>
      {products.map((product) => (
        <button
          key={product.product_id}
          type="button"
          className={tabClassName(selectedProductId === product.product_id)}
          onClick={() => onSelect(product.product_id)}
          title={product.name}
        >
          <span className="font-medium">{product.identifier}</span>
          <span className="max-w-40 truncate">{product.name}</span>
          <span className="text-11 text-placeholder tabular-nums">{product.count}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * profile「需求」tab：该成员负责的产品需求，跨产品聚合。
 *
 * 网格、筛选、详情抽屉全部复用项目需求页那套（网格 canManage=false 即只读）；
 * 筛选与产品范围同样落在 URL 上，刷新 / 分享都能还原。
 */
export const ProfileRequirementsPage = observer(function ProfileRequirementsPage() {
  const { t } = useTranslation();
  const { workspaceSlug, userId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const slug = workspaceSlug?.toString();
  const user = userId?.toString();

  const [initialListQuery] = useState(() => parseListQueryFromSearchParams(searchParams));
  const [initialExpression] = useState(() => listQueryToExpression(initialListQuery));
  const syncedFilterRef = useRef(serializeListQuery(initialListQuery));

  const store = useProfileRequirements({ workspaceSlug: slug, userId: user, initialListQuery });
  const facets = store.requirementsPage.extra_stats ?? null;
  const rows = store.requirementsPage.results;

  // 产品范围：URL 是唯一事实来源。分面未就绪时放行深链，就绪后再校验
  const allowedProductIds = facets ? facets.by_product.map((item) => item.product_id) : null;
  const selectedProductId = getProductFromParam(searchParams.get(PRODUCT_PARAM), allowedProductIds) ?? null;
  const { setProductId } = store;
  useEffect(() => {
    setProductId(selectedProductId);
  }, [selectedProductId, setProductId]);
  const selectProduct = useCallback(
    (productId: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (productId) next.set(PRODUCT_PARAM, productId);
      else next.delete(PRODUCT_PARAM);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // 负责人恒为本人，这一维筛选没有意义；其余与项目需求页同一套配置
  const { areAllConfigsInitialized, configs: allConfigs } = useProjectRequirementFiltersConfig({
    workspaceSlug: slug ?? "",
    projectId: "",
    requirementTypes: store.requirementTypes,
  });
  const configs = useMemo(() => allConfigs.filter((config) => config.id !== "assignee"), [allConfigs]);

  const handleExpressionChange = useCallback(
    (expression: TProjectRequirementFilterExpression) => {
      const query = projectRequirementExpressionToQuery(expression);
      const snapshot = serializeListQuery(query);
      if (snapshot === syncedFilterRef.current) return;
      syncedFilterRef.current = snapshot;
      store.setListFilters(query);
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);
          applyListQueryToSearchParams(params, query);
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams, store.setListFilters]
  );

  const filter = useProjectRequirementFilter({
    instanceKey: `profile-requirements-${user ?? ""}`,
    initialExpression,
    areAllConfigsInitialized,
    configs,
    onExpressionChange: handleExpressionChange,
  });

  // 前进后退改了筛选参数时，把表达式和列表 query 一起灌回去
  useEffect(() => {
    const next = parseListQueryFromSearchParams(searchParams);
    const snapshot = serializeListQuery(next);
    if (snapshot === syncedFilterRef.current) return;
    syncedFilterRef.current = snapshot;
    store.setListFilters(next);
    filter.resetExpression(listQueryToExpression(next));
  }, [filter, searchParams, store.setListFilters]);

  // 详情抽屉 ↔ ?peek=
  const urlPeekRequirementId = searchParams.get("peek");
  const [peekRequirementId, setPeekRequirement] = useState<string | null>(urlPeekRequirementId);
  const syncedPeekRef = useRef(urlPeekRequirementId);
  useEffect(() => {
    if (urlPeekRequirementId === syncedPeekRef.current) return;
    syncedPeekRef.current = urlPeekRequirementId;
    setPeekRequirement(urlPeekRequirementId);
  }, [urlPeekRequirementId]);
  useEffect(() => {
    if (urlPeekRequirementId === peekRequirementId) return;
    syncedPeekRef.current = peekRequirementId;
    const next = new URLSearchParams(searchParams);
    if (peekRequirementId) next.set("peek", peekRequirementId);
    else next.delete("peek");
    setSearchParams(next, { replace: true });
  }, [peekRequirementId, urlPeekRequirementId, searchParams, setSearchParams]);
  const peekRow = peekRequirementId ? (rows.find((row) => row.id === peekRequirementId) ?? null) : null;

  if (!slug || !user) return null;

  const isTrueEmpty = !store.isLoading && !store.error && (facets?.total ?? 0) === 0;

  return (
    <>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-1">
        <FiltersRow filter={filter} />
        <ProductScopeTabs facets={facets} selectedProductId={selectedProductId} onSelect={selectProduct} />
        {isTrueEmpty ? (
          <div className="grid flex-1 place-items-center p-10 text-center">
            <div className="max-w-md">
              <p className="text-14 font-medium text-primary">{t("profile.stats.requirements.page_empty_title")}</p>
              <p className="mt-1.5 text-13 leading-5 text-secondary">
                {t("profile.stats.requirements.page_empty_description")}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ProjectRequirementsGrid
              workspaceSlug={slug}
              projectId={`profile-requirements-${user}`}
              requirementTypes={store.requirementTypes}
              requirements={rows}
              totalCount={store.requirementsPage.total_count ?? 0}
              perPage={store.perPage}
              nextCursor={store.requirementsPage.next_cursor}
              prevCursor={store.requirementsPage.prev_cursor}
              nextPageResults={store.requirementsPage.next_page_results}
              prevPageResults={store.requirementsPage.prev_page_results}
              isLoading={store.isLoading}
              isMutating={false}
              error={store.error}
              onRetry={() => void store.fetchRequirements().catch(() => undefined)}
              canManage={false}
              canManageProducts={false}
              onManageProducts={noop}
              hasLinkedProducts
              hasAnyLinked={(facets?.total ?? 0) > 0}
              activeFilterCount={filter.allConditionsForDisplay.length + (store.search.trim() ? 1 : 0)}
              onClearFilters={() => {
                void filter.clearFilters();
                store.setSearch("");
              }}
              search={store.search}
              onSearchChange={store.setSearch}
              onCursorChange={store.setCursor}
              onPerPageChange={store.setPerPage}
              onOpenDetail={setPeekRequirement}
              onLink={noop}
              onUnlink={noop}
              toolbarAfterSearch={<FiltersToggle filter={filter} />}
            />
          </div>
        )}
      </div>

      {/* 详情抽屉打到产品端点上，只读；「打开整页」跳产品的需求详情页 */}
      {peekRow && (
        <RequirementPeekOverview
          workspaceSlug={slug}
          productId={peekRow.product_id ?? ""}
          requirementId={peekRequirementId}
          requirementTypes={store.requirementTypes}
          rows={rows}
          canEdit={false}
          onClose={() => setPeekRequirement(null)}
          onOpenRequirement={setPeekRequirement}
          onRequirementUpdated={(requirement) => store.syncRequirements([requirement])}
        />
      )}
    </>
  );
});
