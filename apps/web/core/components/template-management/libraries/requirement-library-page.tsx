import { useState } from "react";
import { observer } from "mobx-react";
import { Link, useParams } from "react-router";
import { AlertCircle, Info, Library } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Tooltip } from "@plane/propel/tooltip";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { RequirementGrid } from "@/components/requirements/requirement-grid";
import { getSettingsRequirementTypePath } from "@/components/workspace/settings/requirement-types/navigation";
import { useLibraryItems } from "@/hooks/store/use-library-items";
import { useRequirementLibrariesContext } from "./context";

/**
 * 标准库的条目页。
 *
 * 库直接持有条目，字段来自库所选类型（后端实时解析），条目读写走的接口与产品需求
 * 的明细完全同构，所以这里直接复用 RequirementGrid，不做任何分支。
 */
export const RequirementLibraryPage = observer(function RequirementLibraryPage() {
  const { t } = useTranslation();
  const { libraryId } = useParams();
  const { workspaceSlug, libraries } = useRequirementLibrariesContext();
  const [dataToolbarHost, setDataToolbarHost] = useState<HTMLDivElement | null>(null);
  const store = useLibraryItems({ workspaceSlug, libraryId });

  // 列表缓存能让刷新前的首屏不闪空标题，接口回来后以 store 为准
  const library = store.library ?? libraries.find((item) => item.id === libraryId) ?? null;
  const pageTitle = library?.name ?? t("requirement_libraries.title");

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
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-13 font-medium text-primary">{pageTitle}</span>
                      {library && (
                        <Tooltip tooltipContent={t("requirement_libraries.detail.requirement_type_tooltip")} position="bottom">
                          <Link
                            to={getSettingsRequirementTypePath(workspaceSlug, library.requirement_type_id)}
                            className="max-w-48 shrink-0 truncate rounded-full bg-accent-primary/[0.08] px-2 py-0.5 text-11 text-accent-primary hover:bg-accent-primary/[0.14]"
                          >
                            {library.requirement_type_detail?.name}
                          </Link>
                        </Tooltip>
                      )}
                    </div>
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
        {store.configurationError && !store.configuration ? (
          <div className="flex h-full min-h-80 items-center justify-center p-6 text-center">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-full bg-danger-subtle text-danger-primary">
                <AlertCircle className="size-5" />
              </span>
              <h2 className="mt-3 text-14 font-medium text-primary">{t("requirement_libraries.detail.error_title")}</h2>
              <p className="mt-1 max-w-sm text-12 text-secondary">{store.configurationError}</p>
              <Button
                className="mt-4"
                variant="secondary"
                onClick={() => void store.fetchConfiguration().catch(() => undefined)}
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
                  {t("requirement_libraries.items.fields_readonly_prefix")}
                  <Link
                    to={getSettingsRequirementTypePath(workspaceSlug, library.requirement_type_id)}
                    className="font-medium text-accent-primary hover:underline"
                  >
                    {library.requirement_type_detail?.name}
                  </Link>
                  {t("requirement_libraries.items.fields_readonly_suffix")}
                </span>
              </div>
            )}
            <RequirementGrid
              workspaceSlug={workspaceSlug}
              entityId={libraryId ?? ""}
              expectedUpdatedAt={store.configuration?.expected_updated_at}
              createRequirementTypeId={store.requirementTypeId ?? undefined}
              fields={store.configuration?.fields ?? []}
              requirements={store.requirementsPage.results}
              totalCount={store.requirementsPage.total_count ?? 0}
              totalPages={store.requirementsPage.total_pages ?? 0}
              nextCursor={store.requirementsPage.next_cursor}
              prevCursor={store.requirementsPage.prev_cursor}
              nextPageResults={store.requirementsPage.next_page_results}
              prevPageResults={store.requirementsPage.prev_page_results}
              isLoading={store.isConfigurationLoading || store.isRequirementsLoading}
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
              toolbarPortalEl={dataToolbarHost}
            />
          </>
        )}
      </ContentWrapper>
    </>
  );
});
