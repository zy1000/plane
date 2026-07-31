import { useState } from "react";
import { observer } from "mobx-react";
import { Link, useParams } from "react-router";
import { Info, Library } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Breadcrumbs, Header, Loader } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { RequirementDetailGrid } from "@/components/template-management/requirements/requirement-detail-grid";
import { useRequirementDetails } from "@/hooks/store/use-requirement-template-details";
import { useRequirementLibrariesContext } from "./context";

/**
 * 标准需求的明细数据页。
 *
 * 字段来自库所选模板（后端实时解析），明细读写走的是和产品需求完全一致的接口，
 * 所以这里直接复用 RequirementDetailGrid，不做任何分支。
 */
export const StandardRequirementPage = observer(function StandardRequirementPage() {
  const { t } = useTranslation();
  const { libraryId, requirementId } = useParams();
  const { workspaceSlug, libraries } = useRequirementLibrariesContext();
  const [dataToolbarHost, setDataToolbarHost] = useState<HTMLDivElement | null>(null);
  const detailsStore = useRequirementDetails({ workspaceSlug, requirementId });

  // 库信息只用来渲染面包屑与模板入口，provider 已经拉过整份列表，不再单独请求
  const library = libraries.find((item) => item.id === libraryId) ?? null;
  const requirement = detailsStore.configuration?.requirement;
  const pageTitle = requirement?.title ?? t("requirement_libraries.requirements.title");
  const isLoading = detailsStore.isConfigurationLoading;

  return (
    <>
      <PageHead title={`${pageTitle} - ${t("requirement_libraries.title")}`} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem className="min-w-0">
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      href={`/${workspaceSlug}/templates/libraries`}
                      label={t("requirement_libraries.title")}
                      icon={<Library className="size-4 text-secondary" />}
                    />
                  }
                />
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      href={`/${workspaceSlug}/templates/libraries/${libraryId}`}
                      label={library?.name ?? ""}
                    />
                  }
                />
                <Breadcrumbs.Item
                  component={
                    isLoading ? (
                      <Loader className="w-44">
                        <Loader.Item height="24px" />
                      </Loader>
                    ) : (
                      <span className="truncate text-13 font-medium text-primary">{pageTitle}</span>
                    )
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem className="shrink-0">
              <div ref={setDataToolbarHost} className="flex min-w-0 items-center gap-2" />
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        {detailsStore.configurationError && !detailsStore.configuration ? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div>
              <p className="text-13 font-medium text-primary">{t("requirement_libraries.detail.error_title")}</p>
              <p className="mt-1 max-w-sm text-12 text-secondary">{detailsStore.configurationError}</p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => void detailsStore.fetchConfiguration().catch(() => undefined)}
              >
                {t("retry")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {library && (
              <div className="flex shrink-0 items-start gap-2 border-b border-accent-primary/25 bg-accent-primary/[0.06] px-4 py-2 text-12 text-primary">
                <Info className="mt-0.5 size-3.5 shrink-0 text-accent-primary" />
                <span>
                  {t("requirement_libraries.requirements.fields_readonly_prefix")}
                  <Link
                    to={`/${workspaceSlug}/templates/requirements/${library.template_id}`}
                    className="font-medium text-accent-primary hover:underline"
                  >
                    {library.template_detail?.title}
                  </Link>
                  {t("requirement_libraries.requirements.fields_readonly_suffix")}
                </span>
              </div>
            )}
            <RequirementDetailGrid
              workspaceSlug={workspaceSlug}
              requirementId={requirementId ?? ""}
              expectedUpdatedAt={detailsStore.configuration?.requirement.updated_at}
              fields={detailsStore.configuration?.fields ?? []}
              details={detailsStore.detailsPage.results}
              totalCount={detailsStore.detailsPage.total_count ?? 0}
              totalPages={detailsStore.detailsPage.total_pages ?? 0}
              nextCursor={detailsStore.detailsPage.next_cursor}
              prevCursor={detailsStore.detailsPage.prev_cursor}
              nextPageResults={detailsStore.detailsPage.next_page_results}
              prevPageResults={detailsStore.detailsPage.prev_page_results}
              isLoading={isLoading || detailsStore.isDetailsLoading}
              isMutating={detailsStore.isMutating}
              error={detailsStore.detailsError}
              search={detailsStore.search}
              filters={detailsStore.filters}
              perPage={detailsStore.perPage}
              onSearchChange={detailsStore.setSearch}
              onFiltersChange={detailsStore.setFilters}
              onPerPageChange={detailsStore.setPerPage}
              onCursorChange={detailsStore.setCursor}
              onRefresh={detailsStore.fetchDetails}
              onBulkSave={detailsStore.saveDetailBatch}
              toolbarPortalEl={dataToolbarHost}
            />
          </>
        )}
      </ContentWrapper>
    </>
  );
});
