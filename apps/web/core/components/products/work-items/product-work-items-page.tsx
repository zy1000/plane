/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { WorkItemsIcon } from "@plane/propel/icons";
import { Loader } from "@plane/ui";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { RequirementGridPagination } from "@/components/requirements/requirement-grid-pagination";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { useProductsContext } from "../context";
import { useProductWorkItemsView } from "./use-product-work-items-view";
import { ProductWorkItemsStatePanel } from "./work-items-state-panel";
import { ProductWorkItemsTable } from "./work-items-table";
import { ProductWorkItemsToolbar } from "./work-items-toolbar";

/**
 * 产品 › 工作项：工作项自身「产品」字段指向本产品的工作项，跨关联项目、只读。
 * 左栏按状态组，右侧表格分页；点行开工作项详情抽屉（编辑在抽屉里做，新建回项目里做）。
 */
export const ProductWorkItemsPage = observer(function ProductWorkItemsPage() {
  const { t } = useTranslation();
  const { workspaceSlug, productId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const id = productId?.toString() ?? "";
  const { products } = useProductsContext();
  const product = products.find((item) => item.id === id);
  const view = useProductWorkItemsView({ workspaceSlug: slug, productId: id });
  const { data } = view;

  const featureTitle = t("workspace_products.navigation.work_items");
  // facets 按本产品全部工作项算（不受搜索 / 筛选影响），没有项目 = 本产品一条工作项都没有
  const hasAnyWorkItem = (data?.facets.projects.length ?? 0) > 0;

  const renderBody = () => {
    if (!data) {
      if (view.hasError) {
        return (
          <div className="grid h-full min-h-80 place-items-center px-6 text-center">
            <div>
              <p className="text-13 font-medium text-primary">{t("workspace_products.work_items.load_error")}</p>
              <Button className="mt-3" variant="secondary" onClick={view.retry}>
                {t("retry")}
              </Button>
            </div>
          </div>
        );
      }
      return (
        <Loader className="space-y-2 p-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Loader.Item key={index} height="40px" />
          ))}
        </Loader>
      );
    }
    if (data.results.length > 0) return <ProductWorkItemsTable rows={data.results} onOpen={view.openRow} />;
    if (!hasAnyWorkItem) {
      return (
        <div className="flex flex-col items-center gap-2.5 px-6 pt-28 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-layer-1 text-tertiary">
            <WorkItemsIcon className="size-6" />
          </span>
          <p className="mt-1.5 text-14 font-semibold text-primary">{t("workspace_products.work_items.empty_title")}</p>
          <p className="text-13 text-tertiary">{t("workspace_products.work_items.empty_description")}</p>
        </div>
      );
    }
    return (
      <div className="grid h-full min-h-60 place-items-center px-6 text-center text-13 text-tertiary">
        {t("workspace_products.work_items.filter_empty")}
      </div>
    );
  };

  return (
    <>
      <PageHead title={product ? `${featureTitle} - ${product.name}` : featureTitle} />
      <ContentWrapper className="overflow-hidden bg-surface-1">
        {/* 左栏顶满整列；搜索、筛选只管右侧表格，放在右列里 */}
        <div className="flex h-full min-h-0 overflow-hidden">
          <ProductWorkItemsStatePanel
            counts={data?.state_group_counts}
            selected={view.stateGroup}
            onSelect={view.selectStateGroup}
            loading={!data && view.isLoading}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-end gap-2 border-b border-subtle px-5 py-3">
              <ProductWorkItemsToolbar search={view.search} onSearchChange={view.changeSearch} filter={view.filter} />
            </div>
            <FiltersRow filter={view.filter} />
            <div className="vertical-scrollbar horizontal-scrollbar scrollbar-lg min-h-0 flex-1 overflow-auto">
              {renderBody()}
            </div>
            {data && data.total > 0 && (
              <RequirementGridPagination
                totalCount={data.total}
                perPage={view.perPage}
                pageIndex={view.page - 1}
                isLoading={view.isLoading}
                onPageChange={(pageIndex) => view.setPage(pageIndex + 1)}
                onPerPageChange={view.changePerPage}
              />
            )}
          </div>
        </div>
      </ContentWrapper>
      <IssuePeekOverview />
    </>
  );
});
