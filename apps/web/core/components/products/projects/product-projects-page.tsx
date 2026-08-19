import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { FolderKanban, PackageOpen } from "lucide-react";
import { Link, useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Tooltip } from "@plane/propel/tooltip";
import { EUserWorkspaceRoles } from "@plane/types";
import { Breadcrumbs, Header, Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useProductProjects } from "@/hooks/store/use-product-projects";
import { useProject } from "@/hooks/store/use-project";
import { useProjectFilter } from "@/hooks/store/use-project-filter";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { getCompletionRate, ProductProjectStatusBar } from "./product-project-status-bar";
import { ProductProjectsModal, type TProductProjectCandidate } from "./product-projects-modal";
import { useProductsContext } from "../context";

export const ProductProjectsPage = observer(function ProductProjectsPage() {
  const { t } = useTranslation();
  const { workspaceSlug, productId } = useParams();
  const { data: currentUser } = useUser();
  const { workspaceInfoBySlug, hasAllWorkspacePermissions } = useUserPermissions();
  const { products } = useProductsContext();
  const { joinedProjectIds, getProjectById, loader } = useProject();
  const { currentWorkspaceDisplayFilters } = useProjectFilter();
  const slug = workspaceSlug?.toString() ?? "";
  const product = products.find((item) => item.id === productId);
  const featureTitle = t("workspace_products.navigation.projects");
  const workspaceInfo = workspaceInfoBySlug(slug);
  const canManage = Boolean(
    product &&
      (workspaceInfo?.role === EUserWorkspaceRoles.ADMIN ||
        hasAllWorkspacePermissions(slug) ||
        product.owner === currentUser?.id)
  );
  const { links, isLoading, isMutating, error, fetchProjects, updateProjects } = useProductProjects({
    workspaceSlug: slug || undefined,
    productId: productId?.toString(),
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const candidateProjects = useMemo<TProductProjectCandidate[]>(() => {
    const byId = new Map<string, TProductProjectCandidate>();
    for (const id of joinedProjectIds) {
      const item = getProjectById(id);
      if (!item || item.archived_at) continue;
      byId.set(item.id, {
        id: item.id,
        name: item.name,
        identifier: item.identifier,
        logo_props: item.logo_props,
        created_at: item.created_at,
      });
    }
    for (const link of links) {
      const detail = link.project_detail;
      if (!detail || byId.has(detail.id)) continue;
      const stored = getProjectById(detail.id);
      byId.set(detail.id, {
        id: detail.id,
        name: detail.name,
        identifier: detail.identifier,
        logo_props: detail.logo_props,
        created_at: stored?.created_at,
      });
    }
    // 与项目管理列表同一套排序：默认按创建时间倒序，跟着工作区 display filter 走
    const orderBy = currentWorkspaceDisplayFilters?.order_by?.toString() || "-created_at";
    const isDescending = orderBy.startsWith("-");
    const sortKey = (isDescending ? orderBy.slice(1) : orderBy).trim();
    const factor = isDescending ? -1 : 1;
    return [...byId.values()].sort((left, right) => {
      if (sortKey === "created_at") {
        return (
          factor *
          (new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime())
        );
      }
      return factor * left.name.localeCompare(right.name);
    });
  }, [currentWorkspaceDisplayFilters?.order_by, getProjectById, joinedProjectIds, links]);

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
            {canManage && (
              <Header.RightItem>
                <Button variant="primary" size="lg" onClick={() => setIsModalOpen(true)}>
                  {t("workspace_products.projects.link")}
                </Button>
              </Header.RightItem>
            )}
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
            <div className="flex h-full min-h-80 items-center justify-center bg-surface-1 px-6 py-10">
              <div className="flex max-w-md flex-col items-center text-center">
                <div className="relative mb-5 grid size-20 place-items-center rounded-2xl border border-subtle bg-layer-1 shadow-xs">
                  <div className="absolute inset-2 rounded-xl border border-subtle bg-surface-1" />
                  <FolderKanban className="relative size-7 text-tertiary" strokeWidth={1.5} />
                  <PackageOpen className="absolute -right-1.5 -bottom-1.5 size-6 rounded-md border border-subtle bg-surface-1 p-1.5 text-placeholder" />
                </div>
                <h1 className="text-16 font-semibold text-primary">{t("workspace_products.projects.empty.title")}</h1>
                <p className="mt-2 text-13 leading-5 text-secondary">
                  {t("workspace_products.projects.empty.description")}
                </p>
                {canManage && (
                  <Button variant="primary" size="lg" className="mt-4" onClick={() => setIsModalOpen(true)}>
                    {t("workspace_products.projects.link")}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-[1] bg-layer-1">
                <tr className="border-b border-subtle text-11 font-medium text-secondary">
                  <th className="px-5 py-2.5">{t("workspace_products.projects.title")}</th>
                  <th className="w-24 px-4 py-2.5">{t("workspace_products.projects.requirement_count")}</th>
                  <th className="w-56 px-4 py-2.5">{t("workspace_products.projects.status_distribution")}</th>
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
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-13 tabular-nums text-primary">
                        {link.requirement_count}
                      </td>
                      <td className="px-4 py-3">
                        <ProductProjectStatusBar
                          statusCounts={link.status_counts}
                          total={link.requirement_count}
                        />
                      </td>
                      <td className="px-4 py-3 text-13 tabular-nums text-secondary">
                        <Tooltip tooltipContent={t("workspace_products.projects.completion_hint")}>
                          <span>{getCompletionRate(link.status_counts, link.requirement_count)}%</span>
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
      {canManage && (
        <ProductProjectsModal
          isOpen={isModalOpen}
          projects={candidateProjects}
          isProjectsLoading={loader === "init-loader"}
          links={links}
          isSubmitting={isMutating}
          handleClose={() => setIsModalOpen(false)}
          onSubmit={updateProjects}
        />
      )}
    </>
  );
});
