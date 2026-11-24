/**
 * 项目「产品」页（/:ws/projects/:pid/products）。
 *
 * 展示并管理本项目关联的产品（ProductProject）。这层关系只回答「本项目能引用哪些
 * 产品的需求」：需求页的候选池按它过滤，所以它是整条「需求进项目」链路的入口。
 * 每行带上本项目从该产品引了多少需求、交付到哪 —— 与产品侧「关联项目」表对称。
 *
 * 关联/解除都走 useProjectProducts；解除时若该产品下还有需求关联在本项目，后端 409。
 * 「创建产品」复用工作区的产品弹窗：建成后自动关联到本项目，关联失败只提示、不回滚产品。
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { ChevronDown, ChevronRight, FolderKanban, Link2, Package } from "lucide-react";
import { Link, useParams } from "react-router";
import {
  PERMISSION_KEYS,
  PROJECT_PRODUCT_LINK_MANAGE_PERMISSION_KEY,
  PROJECT_REQUIREMENT_LINK_VIEW_PERMISSION_KEY,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProduct, TProductProject } from "@plane/types";
import { AlertModalCore, CustomMenu, Header, Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { ProductModalCore } from "@/components/products/modal";
import { ProductKindIcon, ProductSetTreeGuide, buildProductSetTree } from "@/components/products/sets/product-set-tree";
import {
  getCompletionRate,
  ProductProjectStatusBar,
} from "@/components/products/projects/product-project-status-bar";
import { ProjectContextChip } from "@/components/projects/project-context-chip";
import { useProducts } from "@/hooks/store/use-products";
import { useProject } from "@/hooks/store/use-project";
import { useProductSets } from "@/hooks/store/use-product-sets";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import { useUserPermissions } from "@/hooks/store/user";
import { LinkProductSetsModal } from "./link-product-sets-modal";
import { ProjectProductsModal } from "./project-products-modal";

export const ProjectProductsPage = observer(function ProjectProductsPage() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const project = projectId?.toString() ?? "";

  const { getProjectById } = useProject();
  const { allowProjectPermissionKeys, allowWorkspacePermissionKeys, workspaceUserInfo } = useUserPermissions();

  // 与后端 ProjectProductViewSet 同一组 key：list 放行 view / manage 任一，create 只认 manage
  const canView = allowProjectPermissionKeys(
    [PROJECT_REQUIREMENT_LINK_VIEW_PERMISSION_KEY, PROJECT_PRODUCT_LINK_MANAGE_PERMISSION_KEY],
    slug,
    project
  );
  const canManage = allowProjectPermissionKeys([PROJECT_PRODUCT_LINK_MANAGE_PERMISSION_KEY], slug, project);
  // 建产品是工作区级动作（workspace.product.create，与产品列表页同一条判定）；建完要挂到本项目，所以还得有关联权限
  const canCreateProduct =
    canManage && allowWorkspacePermissionKeys([PERMISSION_KEYS.WORKSPACE_PRODUCT_CREATE], slug);

  const {
    links,
    isLoading,
    isMutating,
    error,
    fetchProducts: refreshLinks,
    updateProducts,
  } = useProjectProducts({ workspaceSlug: slug || undefined, projectId: project || undefined });
  // 关联弹窗的候选项 = 当前用户可见的工作区产品。没有管理权限就不拉这份列表。
  // 创建产品也走这个 hook：新产品会进同一份列表，关联弹窗里立刻可见
  const { products, isLoading: isProductsLoading, createProduct } = useProducts(canManage ? slug : undefined);

  // 项目也可以关联产品集（后端是 is_set 的产品，走同一个关联接口）
  const { productSets } = useProductSets(canManage ? slug : undefined);
  const [collapsedSetIds, setCollapsedSetIds] = useState<Set<string>>(() => new Set());
  const toggleSet = (setId: string) =>
    setCollapsedSetIds((current) => {
      const next = new Set(current);
      if (next.has(setId)) next.delete(setId);
      else next.add(setId);
      return next;
    });
  const setLinks = links.filter((link) => link.product_is_set);
  const productLinks = links.filter((link) => !link.product_is_set);
  /**
   * 父子结构：已关联的产品集在上，本项目也关联了的集内产品挂在它下面；
   * 所属产品集没被本项目关联的产品，和不属于产品集的产品一样单独列出
   */
  const linkTree = buildProductSetTree(links, {
    getId: (link) => link.product,
    isSet: (link) => link.product_is_set,
    getSetId: (link) => link.product_set_id,
  });
  const linkRows = [
    ...linkTree.groups.flatMap(({ set, children }) => [
      { link: set, kind: "set" as const, isLast: false, childCount: children.length },
      ...(collapsedSetIds.has(set.product)
        ? []
        : children.map((child, index) => ({
            link: child,
            kind: "child" as const,
            isLast: index === children.length - 1,
            childCount: 0,
          }))),
    ]),
    ...linkTree.standalone.map((link) => ({ link, kind: "product" as const, isLast: false, childCount: 0 })),
  ];
  const [isSetModalOpen, setIsSetModalOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
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

  /**
   * 新建的产品挂到本项目。产品此时已经落库，关联失败不能回滚、也不该让弹窗报「创建失败」，
   * 所以这里自己兜错并提示用户去「关联产品」里手动补；成功提示由产品弹窗统一给
   */
  const handleProductCreated = async (createdProduct: TProduct) => {
    try {
      await updateProducts({ products: [createdProduct.id] });
    } catch {
      setToast({
        type: TOAST_TYPE.WARNING,
        title: t("project_products.create_link_failed_title"),
        message: t("project_products.create_link_failed"),
      });
    }
  };

  /**
   * 产品名进产品本身（默认落到产品需求页）；「本项目从它引了哪些需求」挪到需求数列，
   * 落到本项目需求页并按该产品筛选。能看到这张表的人一定看得到这些产品：产品可见范围
   * 本就包含「可见项目所关联的产品」，所以产品名不用再按权限降级成纯文本
   */
  const productHref = (productId: string) => `/${slug}/products/${productId}`;
  const requirementsHref = (productId: string) => `/${slug}/projects/${project}/requirements?product=${productId}`;

  if (!slug || !project) return null;

  // workspaceUserInfo 还没回来时不要抢先渲染 403：权限是异步取的，先渲染会闪一下
  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      {/* 子菜单名已在顶部标签栏高亮，不再重复面包屑：左边关联产品数，右边操作 */}
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              {!isLoading && !error && (
                <span className="text-13 text-tertiary">
                  {setLinks.length
                    ? t("project_products.sets.result_count", { sets: setLinks.length, products: productLinks.length })
                    : t("project_products.result_count", { count: links.length })}
                </span>
              )}
            </Header.LeftItem>
            {canManage && (
              <Header.RightItem>
                {canCreateProduct && (
                  <Button variant="primary" size="lg" onClick={() => setIsCreateOpen(true)}>
                    {t("workspace_products.create_product")}
                  </Button>
                )}
                <Button
                  variant={canCreateProduct ? "secondary" : "primary"}
                  size="lg"
                  onClick={() => setIsModalOpen(true)}
                >
                  {t("project_products.link")}
                </Button>
                <Button variant="secondary" size="lg" onClick={() => setIsSetModalOpen(true)}>
                  {t("project_products.sets.link")}
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
                  <div className="mt-4 flex justify-center gap-2.5">
                    {canCreateProduct && (
                      <Button variant="primary" size="lg" onClick={() => setIsCreateOpen(true)}>
                        {t("workspace_products.create_product")}
                      </Button>
                    )}
                    <Button
                      variant={canCreateProduct ? "secondary" : "primary"}
                      size="lg"
                      onClick={() => setIsModalOpen(true)}
                    >
                      {t("project_products.link")}
                    </Button>
                  </div>
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
                {linkRows.map(({ link, kind, isLast, childCount }) => {
                  const isSetRow = kind === "set";
                  const isCollapsed = isSetRow && collapsedSetIds.has(link.product);
                  return (
                    <tr
                      key={link.id}
                      className={cn(
                        "group hover:bg-layer-transparent-hover",
                        // 展开的产品集与它的子行之间、子行之间不画分隔线，整组读作一块
                        // （不用透明边框：它仍占 1px，会在带底色的子行间露白缝）
                        !((isSetRow && childCount > 0 && !isCollapsed) || (kind === "child" && !isLast)) &&
                          "border-b border-subtle",
                        kind === "child" && "bg-layer-1/40"
                      )}
                    >
                      {/* 子行从产品集图标的正下方引线，图标比独立产品明显靠右一档：独立产品与产品集图标对齐，不能看着像子行 */}
                      <td className={kind === "child" ? "relative py-2.5 pr-5 pl-[78px]" : "px-5 py-3"}>
                        {kind === "child" && <ProductSetTreeGuide left={62} isLast={isLast} />}
                        <div className="flex min-w-0 items-center gap-2">
                          {isSetRow ? (
                            <button
                              type="button"
                              onClick={() => toggleSet(link.product)}
                              disabled={childCount === 0}
                              aria-expanded={!isCollapsed}
                              aria-label={t(
                                isCollapsed ? "project_requirements.tree.expand" : "project_requirements.tree.collapse"
                              )}
                              className="grid size-[22px] shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary disabled:invisible"
                            >
                              {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                            </button>
                          ) : kind === "product" ? (
                            <span className="size-[22px] shrink-0" />
                          ) : null}
                          <ProductKindIcon isSet={isSetRow} />
                          <Link
                            to={productHref(link.product)}
                            title={link.product_name}
                            className="truncate text-13 font-medium text-primary group-hover:text-accent-primary hover:underline"
                          >
                            {link.product_name || link.product_identifier}
                          </Link>
                          <span className="shrink-0 font-mono text-12 text-tertiary">{link.product_identifier}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-13 text-secondary">
                        <span className="block truncate" title={link.product_code}>
                          {/* 产品集没有项目代号（库里的 code 只是名称的副本） */}
                          {(!link.product_is_set && link.product_code) || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-13 tabular-nums text-primary">
                        {link.requirement_count > 0 ? (
                          <Link to={requirementsHref(link.product)} className="hover:text-accent-primary hover:underline">
                            {link.requirement_count}
                          </Link>
                        ) : (
                          link.requirement_count
                        )}
                      </td>
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
                  );
                })}
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
          // 产品集另有「关联产品集」弹窗，这里只管产品
          links={productLinks}
          projectCode={projectDetail?.code?.trim() ?? ""}
          isSubmitting={isMutating}
          handleClose={() => setIsModalOpen(false)}
          onSubmit={handleModalSubmit}
        />
      )}

      {canManage && (
        <LinkProductSetsModal
          isOpen={isSetModalOpen}
          productSets={productSets}
          linkedIds={new Set(setLinks.map((link) => link.product))}
          linkedProductIds={new Set(productLinks.map((link) => link.product))}
          isSubmitting={isMutating}
          handleClose={() => setIsSetModalOpen(false)}
          onSubmit={(productSetIds) => {
            void (async () => {
              try {
                await updateProducts({ products: productSetIds });
                setIsSetModalOpen(false);
                setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_products.sets.toast_linked") });
              } catch (error) {
                notifyLinkError(error);
              }
            })();
          }}
        />
      )}

      {canCreateProduct && (
        <ProductModalCore
          workspaceSlug={slug}
          modal={{ isOpen: isCreateOpen, mode: "create", product: null }}
          createProduct={createProduct}
          closeProductModal={() => setIsCreateOpen(false)}
          onCreated={handleProductCreated}
          headerContext={projectDetail?.name ? <ProjectContextChip name={projectDetail.name} /> : null}
          footerNote={
            <p className="flex items-center gap-1.5 truncate text-12 text-tertiary">
              <Link2 className="size-3.5 shrink-0" />
              <span className="truncate">{t("project_products.create_modal.footer_note")}</span>
            </p>
          }
        />
      )}
    </>
  );
});
