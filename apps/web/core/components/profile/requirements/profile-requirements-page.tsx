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
import type { TIssueGroupByOptions } from "@plane/types";
// components
import { FilterGroupBy, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { ProfileIssueGroupEmpty } from "@/components/profile/issues/profile-issue-columns";
import { ProfileRelationRail } from "@/components/profile/relation-rail";
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
import { RequirementPeekOverview } from "@/components/requirements/requirement-detail";
import { getCurrentPageOffset } from "@/components/requirements/requirement-grid-shared";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
// constants
import { PROFILE_USER_RELATION_GROUPS } from "@/constants/profile-user-relation";
import type { TProfileUserRelation } from "@/constants/profile-user-relation";
// hooks
import { useProfileRequirements } from "@/hooks/store/use-profile-requirements";
// local imports
import { ProfileRequirementsTable } from "./profile-requirements-table";
import { ProfileProductScopeMenu, ProfileRequirementSearch } from "./profile-requirements-toolbar";

/** 「显示 › 分组方式」：与本人关系 / 无 */
const GROUP_BY_OPTIONS: TIssueGroupByOptions[] = ["user_relation", null];

/**
 * profile「需求」tab：该成员负责或创建的产品需求，跨产品聚合。
 *
 * 版式与工作项 / 缺陷页一致：工具栏（搜索、产品范围 | 筛选、显示）→ 左栏「与本人关系」三组常驻 → 表格。
 * 筛选、详情抽屉复用项目需求页那套；筛选与产品范围落在 URL 上，刷新 / 分享都能还原。
 * 分组方式可在「显示」里改成不分组，此时没有左栏、表格是负责 ∪ 创建的全集。
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
  const isGrouped = store.groupBy === "user_relation";

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

  // 负责人一维不开放筛选；其余与项目需求页同一套配置
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

  // 左栏三组：条数跟着筛选 / 搜索 / 产品范围走，0 条也常驻
  const railItems = useMemo(
    () =>
      PROFILE_USER_RELATION_GROUPS.map(({ key, name, icon: Icon, iconClassName }) => ({
        id: key,
        name,
        icon: <Icon className={`size-4 ${iconClassName}`} />,
        count: store.relationCounts?.[key] ?? 0,
      })),
    [store.relationCounts]
  );
  const activeGroupName = PROFILE_USER_RELATION_GROUPS.find((group) => group.key === store.relation)?.name ?? "";

  if (!slug || !user) return null;

  const isTrueEmpty = !store.isLoading && !store.error && (facets?.total ?? 0) === 0;
  const hasActiveFilter = filter.allConditionsForDisplay.length > 0 || store.search.trim().length > 0;
  const { requirementsPage, perPage } = store;
  const pageIndex = getCurrentPageOffset(
    requirementsPage.prev_cursor,
    requirementsPage.next_cursor,
    requirementsPage.prev_page_results,
    requirementsPage.next_page_results
  );

  const emptyContent =
    isGrouped && !hasActiveFilter ? (
      <ProfileIssueGroupEmpty
        groupId={store.relation}
        groupName={activeGroupName}
        entityLabel={t("profile.tabs.requirements")}
      />
    ) : (
      <div className="grid place-items-center px-6 py-24 text-center">
        <div className="max-w-md">
          <p className="text-14 font-medium text-primary">{t("project_requirements.filtered_empty.title")}</p>
          <p className="mt-1.5 text-13 leading-5 text-secondary">
            {t("project_requirements.filtered_empty.description")}
          </p>
        </div>
      </div>
    );

  return (
    <>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-1">
        <div className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-subtle px-page-x">
          <ProfileRequirementSearch value={store.search} onChange={store.setSearch} />
          <ProfileProductScopeMenu facets={facets} selectedProductId={selectedProductId} onSelect={selectProduct} />
          <div className="ml-auto flex items-center gap-2">
            <FiltersToggle filter={filter} />
            <FiltersDropdown title={t("common.display")} placement="bottom-end">
              <div className="px-2.5 py-2">
                <FilterGroupBy
                  displayFilters={{ group_by: store.groupBy }}
                  groupByOptions={GROUP_BY_OPTIONS}
                  handleUpdate={(value) => store.setGroupBy(value === "user_relation" ? "user_relation" : null)}
                  ignoreGroupedFilters={[]}
                />
              </div>
            </FiltersDropdown>
          </div>
        </div>
        <FiltersRow filter={filter} />
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
          <div className="flex min-h-0 flex-1">
            {isGrouped && (
              <ProfileRelationRail
                heading={t("profile.user_relation")}
                items={railItems}
                selectedId={store.relation}
                onSelect={(id) => store.setRelation(id as TProfileUserRelation)}
              />
            )}
            <ProfileRequirementsTable
              workspaceSlug={slug}
              rows={rows}
              isLoading={store.isLoading}
              error={store.error}
              onRetry={() => void store.fetchRequirements().catch(() => undefined)}
              onOpenDetail={setPeekRequirement}
              totalCount={requirementsPage.total_count ?? 0}
              perPage={perPage}
              pageIndex={pageIndex}
              onPageChange={(index) => store.setCursor(index <= 0 ? undefined : `${perPage}:${index}:0`)}
              onPerPageChange={store.setPerPage}
              empty={emptyContent}
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
