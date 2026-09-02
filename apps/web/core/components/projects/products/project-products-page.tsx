/**
 * 项目「产品」页（/:ws/projects/:pid/products）。
 *
 * 展示并管理本项目关联的产品（ProductProject）。这层关系只回答「本项目能引用哪些
 * 产品的需求」：需求页的候选池按它过滤，所以它是整条「需求进项目」链路的入口。
 * 每行带上本项目从该产品引了多少需求、交付到哪 —— 与产品侧「关联项目」表对称。
 *
 * 关联/解除都走 useProjectProducts；解除时若该产品下还有需求关联在本项目，后端 409。
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { FolderKanban, Package } from "lucide-react";
import { useParams } from "react-router";
import {
  PROJECT_PRODUCT_LINK_MANAGE_PERMISSION_KEY,
  PROJECT_REQUIREMENT_LINK_VIEW_PERMISSION_KEY,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProductProject } from "@plane/types";
import { AlertModalCore, Breadcrumbs, CustomMenu, Header, Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { ProductChip } from "@/components/products/product-chip";
import {
  getCompletionRate,
  ProductProjectStatusBar,
} from "@/components/products/projects/product-project-status-bar";
import { useProducts } from "@/hooks/store/use-products";
import { useProject } from "@/hooks/store/use-project";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { ProjectProductsModal } from "./project-products-modal";

export const ProjectProductsPage = observer(function ProjectProductsPage() {
  const { t } = useTranslation();
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const project = projectId?.toString() ?? "";

  const { getProjectById, loader } = useProject();
  const { allowProjectPermissionKeys, workspaceUserInfo } = useUserPermissions();

  // 与后端 ProjectProductViewSet 同一组 key：list 放行 view / manage 任一，create 只认 manage
  const canView = allowProjectPermissionKeys(
    [PROJECT_REQUIREMENT_LINK_VIEW_PERMISSION_KEY, PROJECT_PRODUCT_LINK_MANAGE_PERMISSION_KEY],
    slug,
    project
  );
  const canManage = allowProjectPermissionKeys([PROJECT_PRODUCT_LINK_MANAGE_PERMISSION_KEY], slug, project);

  const {
    links,
    isLoading,
    isMutating,
    error,
    fetchProducts: refreshLinks,
    updateProducts,
  } = useProjectProducts({ workspaceSlug: slug || undefined, projectId: project || undefined });
  // 关联弹窗的候选项 = 当前用户可见的工作区产品。没有管理权限就不拉这份列表
  const { products, isLoading: isProductsLoading } = useProducts(canManage ? slug : undefined);

  const [isModalOpen, setIsModalOpen] = useState(false);
  /** 行级解除关联的二次确认对象。确认框里展示产品名，避免解错行 */
  const [pendingUnlink, setPendingUnlink] = useState<TProductProject | null>(null);

  const projectDetail = project ? getProjectById(project) : undefined;
  const pageTitle = projectDetail?.name
    ? `${projectDetail.name} - ${t("project_products.title")}`
    : t("project_products.title");

  const notifyLinkError = (error: unknown) => {
    const payload = error as { error?: string; code?: string } | null;
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t("error"),
      message:
        payload?.code === "PRODUCT_HAS_LINKED_REQUIREMENTS"
          ? t("project_products.has_linked_requirements")
          : (payload?.error ?? t("error")),
    });
  };

  const handleUnlinkConfirm = () => {
    if (!pendingUnlink) return;
    void (async () => {
      try {
        await updateProducts({ removed_products: [pendingUnlink.product] });
        setPendingUnlink(null);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_products.toast_unlinked") });
      } catch (error) {
        notifyLinkError(error);
      }
    })();
  };

  /** 弹窗自己会把 PRODUCT_HAS_LINKED_REQUIREMENTS 翻成文案，这里只负责成功提示 */
  const handleModalSubmit = async (payload: { products: string[]; removed_products: string[] }) => {
    await updateProducts(payload);
    setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_products.toast_updated") });
  };

  /** 产品名落到需求页并按该产品筛选：从项目看过来，关心的是「本项目从它引了哪些需求」 */
  const requirementsHref = (productId: string) => `/${slug}/projects/${project}/requirements?product=${productId}`;

  if (!slug || !project) return null;

  // workspaceUserInfo 还没回来时不要抢先渲染 403：权限是异步取的，先渲染会闪一下
  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
                <CommonProjectBreadcrumbs workspaceSlug={slug} projectId={project} />
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={t("project_products.title")}
                      href={`/${slug}/projects/${project}/products/`}
                      icon={<Package className="h-4 w-4 text-secondary" />}
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
                  {t("project_products.link")}
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
                <p className="text-13 font-medium text-primary">{t("project_products.error_title")}</p>
                <p className="mt-1 text-12 text-secondary">{error}</p>
                <Button
                  className="mt-3"
                  variant="secondary"
                  onClick={() => void refreshLinks().catch(() => undefined)}
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
                  <Package className="relative size-7 text-tertiary" strokeWidth={1.5} />
                  <FolderKanban className="absolute -right-1.5 -bottom-1.5 size-6 rounded-md border border-subtle bg-surface-1 p-1.5 text-placeholder" />
                </div>
                <h1 className="text-16 font-semibold text-primary">{t("project_products.empty.title")}</h1>
                <p className="mt-2 text-13 leading-5 text-secondary">{t("project_products.empty.description")}</p>
                {canManage && (
                  <Button variant="primary" size="lg" className="mt-4" onClick={() => setIsModalOpen(true)}>
                    {t("project_products.link")}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-[1] bg-layer-1">
                <tr className="border-b border-subtle text-11 font-medium text-secondary">
                  <th className="px-5 py-2.5">{t("project_products.columns.product")}</th>
                  <th className="w-44 px-4 py-2.5">{t("project_products.columns.code")}</th>
                  <th className="w-24 px-4 py-2.5">{t("project_products.columns.requirement_count")}</th>
                  <th className="w-56 px-4 py-2.5">{t("project_products.columns.status_distribution")}</th>
                  <th className="w-24 px-4 py-2.5">{t("project_products.columns.completion")}</th>
                  <th className="w-40 px-4 py-2.5">{t("project_products.columns.linked_at")}</th>
                  {canManage && (
                    <th className="w-12 px-4 py-2.5">
                      <span className="sr-only">{t("project_products.unlink")}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={link.id} className="group border-b border-subtle hover:bg-layer-transparent-hover">
                    <td className="px-5 py-3">
                      <ProductChip
                        identifier={link.product_identifier}
                        name={link.product_name}
                        logoProps={link.product_logo_props}
                        href={requirementsHref(link.product)}
                        className="font-medium text-primary group-hover:text-accent-primary"
                      />
                    </td>
                    <td className="px-4 py-3 text-13 text-secondary">
                      <span className="block truncate" title={link.product_code}>
                        {link.product_code || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-13 tabular-nums text-primary">{link.requirement_count}</td>
                    <td className="px-4 py-3">
                      <ProductProjectStatusBar statusCounts={link.status_counts} total={link.requirement_count} />
                    </td>
                    <td className="px-4 py-3 text-13 tabular-nums text-secondary">
                      <Tooltip tooltipContent={t("project_products.completion_hint")}>
                        <span>{getCompletionRate(link.status_counts, link.requirement_count)}%</span>
                      </Tooltip>
                    </td>
                    <td className="px-4 py-3 text-11 text-secondary">
                      {renderFormattedDate(link.created_at, "yyyy-MM-dd") ?? "-"}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <CustomMenu placement="bottom-end" closeOnSelect ellipsis ariaLabel={t("project_products.unlink")}>
                          <CustomMenu.MenuItem
                            onClick={() => setPendingUnlink(link)}
                            disabled={isMutating}
                            className="text-danger-primary"
                          >
                            {t("project_products.unlink")}
                          </CustomMenu.MenuItem>
                        </CustomMenu>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </ContentWrapper>

      <AlertModalCore
        isOpen={pendingUnlink !== null}
        isSubmitting={isMutating}
        handleClose={() => setPendingUnlink(null)}
        handleSubmit={handleUnlinkConfirm}
        title={t("project_products.unlink_confirm_title")}
        content={t("project_products.unlink_confirm_description", {
          name: pendingUnlink?.product_name || pendingUnlink?.product_identifier || "",
        })}
        // AlertModalCore 的按钮默认是英文硬编码，本仓库其余调用点也都显式传
        primaryButtonText={{ default: t("project_products.unlink"), loading: t("loading") }}
        secondaryButtonText={t("cancel")}
      />

      {canManage && (
        <ProjectProductsModal
          isOpen={isModalOpen}
          products={products}
          isProductsLoading={isProductsLoading}
          links={links}
          isSubmitting={isMutating}
          handleClose={() => setIsModalOpen(false)}
          onSubmit={handleModalSubmit}
        />
      )}
    </>
  );
});
