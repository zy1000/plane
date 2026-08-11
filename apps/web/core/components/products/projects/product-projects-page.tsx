import { observer } from "mobx-react";
import { FolderKanban } from "lucide-react";
import { Link, useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Tooltip } from "@plane/propel/tooltip";
import { Breadcrumbs, Header, Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useProductProjects } from "@/hooks/store/use-product-projects";
import { getCompletionRate, ProductProjectStageBar } from "./product-project-stage-bar";
import { useProductsContext } from "../context";

export const ProductProjectsPage = observer(function ProductProjectsPage() {
  const { t } = useTranslation();
  const { workspaceSlug, productId } = useParams();
  const { products } = useProductsContext();
  const slug = workspaceSlug?.toString() ?? "";
  const product = products.find((item) => item.id === productId);
  const featureTitle = t("workspace_products.navigation.projects");
  const { links, isLoading, error, fetchProjects } = useProductProjects({
    workspaceSlug: slug || undefined,
    productId: productId?.toString(),
  });

  return (
    <>
      <PageHead title={product ? `${featureTitle} - ${product.name}` : featureTitle} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={featureTitle}
                      icon={<FolderKanban className="size-4 text-tertiary" />}
                      isLast
                    />
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
          </Header>
        }
      />
      <ContentWrapper>
        <div className="h-full overflow-auto bg-surface-1">
          {isLoading ? (
            <div className="p-4">
              <Loader className="space-y-2">
                {Array.from({ length: 5 }, (_, index) => (
                  <Loader.Item key={index} height="44px" />
                ))}
              </Loader>
            </div>
          ) : error ? (
            <div className="grid h-full min-h-80 place-items-center px-6 py-16 text-center">
              <div className="max-w-md">
                <p className="text-13 font-medium text-primary">{t("workspace_products.projects.error_title")}</p>
                <p className="mt-1 text-12 text-secondary">{error}</p>
                <Button
                  className="mt-3"
                  variant="secondary"
                  onClick={() => void fetchProjects().catch(() => undefined)}
                >
                  {t("retry")}
                </Button>
              </div>
            </div>
          ) : !links.length ? (
            <div className="grid h-full min-h-80 place-items-center px-6 py-16 text-center">
              <div className="max-w-md">
                <p className="text-13 font-medium text-primary">{t("workspace_products.projects.empty.title")}</p>
                <p className="mt-1 text-12 leading-5 text-secondary">
                  {t("workspace_products.projects.empty.description")}
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-[1] bg-layer-1">
                <tr className="border-b border-subtle text-11 font-medium text-secondary">
                  <th className="px-5 py-2.5">{t("workspace_products.projects.title")}</th>
                  <th className="w-24 px-4 py-2.5">{t("workspace_products.projects.requirement_count")}</th>
                  <th className="w-56 px-4 py-2.5">{t("workspace_products.projects.stage_distribution")}</th>
                  <th className="w-24 px-4 py-2.5">{t("workspace_products.projects.completion")}</th>
                  <th className="w-40 px-4 py-2.5">{t("workspace_products.projects.linked_at")}</th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => {
                  const project = link.project_detail;
                  return (
                    <tr key={link.id} className="group border-b border-subtle hover:bg-layer-transparent-hover">
                      <td className="px-5 py-3">
                        {/* 落到项目需求页而不是项目总览：从产品看过来，关心的是这个项目引了哪些需求 */}
                        <Link
                          to={`/${slug}/projects/${link.project}/requirements`}
                          className="flex min-w-0 items-center gap-2"
                        >
                          <span className="grid size-4 shrink-0 place-items-center">
                            <Logo logo={project?.logo_props} size={14} />
                          </span>
                          <span className="truncate text-13 font-medium text-primary group-hover:text-accent-primary">
                            {project?.name ?? link.project}
                          </span>
                          {project?.identifier && (
                            <span className="shrink-0 rounded bg-layer-2 px-1.5 py-0.5 text-11 text-secondary">
                              {project.identifier}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-13 tabular-nums text-primary">
                        {link.requirement_count}
                      </td>
                      <td className="px-4 py-3">
                        <ProductProjectStageBar
                          stageCounts={link.stage_counts}
                          total={link.requirement_count}
                        />
                      </td>
                      <td className="px-4 py-3 text-13 tabular-nums text-secondary">
                        <Tooltip tooltipContent={t("workspace_products.projects.completion_hint")}>
                          <span>{getCompletionRate(link.stage_counts, link.requirement_count)}%</span>
                        </Tooltip>
                      </td>
                      <td className="px-4 py-3 text-11 text-secondary">
                        {renderFormattedDate(link.created_at, "yyyy-MM-dd") ?? "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </ContentWrapper>
    </>
  );
});
