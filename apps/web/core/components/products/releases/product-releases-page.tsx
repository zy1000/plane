import { useMemo } from "react";
import { observer } from "mobx-react";
import { Circle, Rocket, Search } from "lucide-react";
import { useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Breadcrumbs, CustomSelect, Header, Loader, ToggleSwitch } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { ReleaseGroupSidebar, type TReleaseSidebarGroup } from "@/components/releases/list/release-group-sidebar";
import { RELEASE_STATUS } from "@/components/releases/release-status-config";
import { useProductReleases } from "@/hooks/store/use-product-releases";
import { useProductsContext } from "../context";
import { ProductReleaseRow } from "./product-release-row";
import { useProductReleaseFilters } from "./use-product-release-filters";

export const ProductReleasesPage = observer(function ProductReleasesPage() {
  const { t } = useTranslation();
  const { workspaceSlug, productId } = useParams();
  const { products } = useProductsContext();
  const slug = workspaceSlug?.toString() ?? "";
  const product = products.find((item) => item.id === productId);
  const featureTitle = t("workspace_products.navigation.releases");
  const { data, isLoading, error, fetchReleases } = useProductReleases({
    workspaceSlug: slug || undefined,
    productId: productId?.toString(),
  });
  const {
    statusFilter,
    setStatusFilter,
    projectFilter,
    setProjectFilter,
    onlyThisProduct,
    setOnlyThisProduct,
    searchQuery,
    setSearchQuery,
    projectOptions,
    statusCounts,
    filteredReleases,
  } = useProductReleaseFilters(data.releases);
  const hasReleaseList = !isLoading && !error && data.releases.length > 0;

  const selectedProjectName = projectFilter
    ? (projectOptions.find((option) => option.id === projectFilter)?.name ?? projectFilter)
    : t("workspace_products.releases.filter_all_projects");

  const statusGroups = useMemo<TReleaseSidebarGroup[]>(
    () => [
      {
        id: "all",
        name: t("workspace_products.releases.filter_all"),
        count: statusCounts.all ?? 0,
        icon: <Circle className="size-4 text-tertiary" strokeWidth={2} />,
      },
      ...RELEASE_STATUS.map((status) => {
        const Icon = status.icon;
        return {
          id: status.value,
          name: status.label,
          count: statusCounts[status.value] ?? 0,
          icon: <Icon className="size-4" strokeWidth={2} style={{ color: status.color }} />,
        };
      }),
    ],
    [statusCounts, t]
  );

  const filterControls = (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <CustomSelect
        value={projectFilter}
        onChange={(value: string | null) => setProjectFilter(value)}
        buttonClassName="h-8 !border-subtle bg-surface-1 py-0"
        label={<span className="text-12 text-primary">{selectedProjectName}</span>}
      >
        <CustomSelect.Option value={null}>
          {t("workspace_products.releases.filter_all_projects")}
        </CustomSelect.Option>
        {projectOptions.map((option) => (
          <CustomSelect.Option key={option.id} value={option.id}>
            {option.name}
          </CustomSelect.Option>
        ))}
      </CustomSelect>
      <div className="flex items-center gap-2 text-12 text-secondary">
        <span>{t("workspace_products.releases.only_this_product")}</span>
        <ToggleSwitch
          value={onlyThisProduct}
          onChange={setOnlyThisProduct}
          label={t("workspace_products.releases.only_this_product")}
          size="sm"
        />
      </div>
      <label className="relative block w-40 sm:w-52">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-placeholder" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t("workspace_products.releases.search_placeholder")}
          className="focus:border-accent-primary h-8 w-full rounded-md border border-subtle bg-surface-1 pr-2 pl-8 text-12 text-primary outline-none placeholder:text-placeholder"
        />
      </label>
    </div>
  );

  return (
    <>
      <PageHead title={product ? `${featureTitle} - ${product.name}` : featureTitle} />
      <AppHeader
        rowClassName={hasReleaseList ? "h-auto min-h-11 py-1.5" : undefined}
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink label={featureTitle} icon={<Rocket className="size-4 text-tertiary" />} isLast />
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            {hasReleaseList && <Header.RightItem className="max-w-full shrink-0">{filterControls}</Header.RightItem>}
          </Header>
        }
      />
      <ContentWrapper className="overflow-hidden">
        {isLoading ? (
          <div className="h-full overflow-auto bg-surface-1 p-4">
            <Loader className="space-y-2">
              {Array.from({ length: 5 }, (_, index) => (
                <Loader.Item key={index} height="44px" />
              ))}
            </Loader>
          </div>
        ) : error ? (
          <div className="grid h-full min-h-80 place-items-center bg-surface-1 px-6 py-16 text-center">
            <div className="max-w-md">
              <p className="text-13 font-medium text-primary">{t("workspace_products.releases.error_title")}</p>
              <p className="mt-1 text-12 text-secondary">{error}</p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => void fetchReleases().catch(() => undefined)}
              >
                {t("retry")}
              </Button>
            </div>
          </div>
        ) : data.linked_project_count === 0 ? (
          <div className="grid h-full min-h-80 place-items-center bg-surface-1 px-6 py-16 text-center">
            <div className="max-w-md">
              <p className="text-13 font-medium text-primary">
                {t("workspace_products.releases.empty.no_projects.title")}
              </p>
              <p className="mt-1 text-12 leading-5 text-secondary">
                {t("workspace_products.releases.empty.no_projects.description")}
              </p>
            </div>
          </div>
        ) : !data.releases.length ? (
          <div className="grid h-full min-h-80 place-items-center bg-surface-1 px-6 py-16 text-center">
            <div className="max-w-md">
              <p className="text-13 font-medium text-primary">
                {t("workspace_products.releases.empty.no_releases.title")}
              </p>
              <p className="mt-1 text-12 leading-5 text-secondary">
                {t("workspace_products.releases.empty.no_releases.description")}
              </p>
            </div>
          </div>
        ) : (
          <div className="relative flex size-full overflow-hidden bg-surface-2">
            <ReleaseGroupSidebar
              groups={statusGroups}
              groupBy="status"
              selectedGroupId={statusFilter}
              onSelectGroup={(groupId) => setStatusFilter(groupId as typeof statusFilter)}
            />
            <div className="vertical-scrollbar scrollbar-lg h-full min-w-0 flex-1 overflow-y-auto bg-surface-1">
              {!filteredReleases.length ? (
                <div className="grid h-full min-h-80 place-items-center px-6 py-16 text-center">
                  <p className="text-12 text-secondary">{t("workspace_products.releases.empty.no_match")}</p>
                </div>
              ) : (
                <table className="w-full table-fixed border-collapse text-left">
                  <thead className="sticky top-0 z-[1] bg-layer-1">
                    <tr className="border-b border-subtle text-11 font-medium text-secondary">
                      <th className="w-[26%] px-5 py-2.5">{t("workspace_products.releases.title")}</th>
                      <th className="w-[24%] px-4 py-2.5">{t("workspace_products.releases.project")}</th>
                      <th className="w-[9%] px-4 py-2.5">{t("workspace_products.releases.status")}</th>
                      <th className="w-[10%] px-4 py-2.5">{t("workspace_products.releases.lead")}</th>
                      <th className="w-[11%] px-4 py-2.5">{t("workspace_products.releases.target_date")}</th>
                      <th className="w-[11%] px-4 py-2.5">{t("workspace_products.releases.test_handoff_date")}</th>
                      <th className="w-[9%] px-4 py-2.5">{t("workspace_products.releases.requirement_count")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReleases.map((release) => (
                      <ProductReleaseRow key={release.id} release={release} workspaceSlug={slug} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </ContentWrapper>
    </>
  );
});
