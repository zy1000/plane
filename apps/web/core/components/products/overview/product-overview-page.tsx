import { observer } from "mobx-react";
import { useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import {
  PRODUCT_PROJECT_LINK_MANAGE_PERMISSION_KEY,
  PRODUCT_REQUIREMENT_CREATE_PERMISSION_KEY,
  PRODUCT_SETTINGS_EDIT_PERMISSION_KEY,
} from "@plane/constants";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useTemplatePermissions } from "@/components/template-management/permissions";
import { useProductOverview } from "@/hooks/store/use-product-overview";
import { useProductProjects } from "@/hooks/store/use-product-projects";
import { useProductReleases } from "@/hooks/store/use-product-releases";
import { useProductsContext } from "../context";
import { ProductModal } from "../modal";
import { getProductTabPath } from "../navigation";
import { hasProductPermission } from "../permissions";
import { ProductOverviewHeader } from "./overview-header";
import { ProductOverviewInfoCard } from "./overview-info-card";
import { ProductOverviewProjectsCard } from "./overview-projects-card";
import { ProductOverviewReleasesCard } from "./overview-releases-card";
import { ProductOverviewRequirementsCard } from "./overview-requirements-card";
import { ProductOverviewTestCard } from "./overview-test-card";

/**
 * 产品概览（进产品的默认页签）。左栏：需求概况 / 关联项目 / 发布 + 测试；右栏：产品信息。
 *
 * 需求、测试的数字来自 overview 接口；关联项目、发布复用对应页签的 hook，口径一致。
 */
export const ProductOverviewPage = observer(function ProductOverviewPage() {
  const { t } = useTranslation();
  const { workspaceSlug, productId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const id = productId?.toString() ?? "";
  const { products, openProductModal } = useProductsContext();
  const product = products.find((item) => item.id === id);
  const { canViewLibraries } = useTemplatePermissions(slug || undefined);

  const scope = { workspaceSlug: slug || undefined, productId: id || undefined };
  const { overview, isLoading } = useProductOverview(scope);
  const { links, isLoading: isProjectsLoading } = useProductProjects(scope);
  const { data: releaseData, isLoading: isReleasesLoading } = useProductReleases(scope);

  // 外层 ProductDetailsLayout 在产品取回前不渲染子页，这里只是类型兜底
  if (!product) return null;

  const pathOf = (tab: Parameters<typeof getProductTabPath>[2]) => getProductTabPath(slug, id, tab);
  const canEdit = hasProductPermission(product, PRODUCT_SETTINGS_EDIT_PERMISSION_KEY);
  const canCreateRequirement = hasProductPermission(product, PRODUCT_REQUIREMENT_CREATE_PERMISSION_KEY);
  const canLinkProjects = hasProductPermission(product, PRODUCT_PROJECT_LINK_MANAGE_PERMISSION_KEY);

  return (
    <>
      <PageHead title={`${t("workspace_products.navigation.overview")} - ${product.name}`} />
      <ContentWrapper className="bg-surface-1">
        <div className="flex flex-col gap-5 px-7 pt-6 pb-10">
          <ProductOverviewHeader product={product} onEdit={canEdit ? () => openProductModal("edit", product) : undefined} />

          <div className="flex flex-wrap items-start gap-5">
            <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-4">
              <ProductOverviewRequirementsCard
                summary={overview?.requirements}
                isLoading={isLoading}
                requirementsPath={pathOf("requirements")}
                canCreate={canCreateRequirement}
                canImport={canViewLibraries}
              />
              <ProductOverviewProjectsCard
                workspaceSlug={slug}
                links={links}
                isLoading={isProjectsLoading}
                projectsPath={pathOf("projects")}
                canLink={canLinkProjects}
              />
              <div className="flex flex-wrap items-stretch gap-4">
                <ProductOverviewReleasesCard
                  workspaceSlug={slug}
                  releases={releaseData.releases}
                  isLoading={isReleasesLoading}
                  releasesPath={pathOf("releases")}
                />
                <ProductOverviewTestCard
                  test={overview?.test}
                  coverage={overview?.requirements === null ? null : overview?.requirements?.coverage}
                  isLoading={isLoading}
                  testhubPath={pathOf("testhub")}
                />
              </div>
            </div>
            <aside className="flex min-w-0 flex-[1_1_300px] flex-col">
              <ProductOverviewInfoCard product={product} />
            </aside>
          </div>
        </div>
      </ContentWrapper>
      {/* 「编辑产品」用列表页同一个弹窗；Provider 在 products/layout，保存后 products 里那一条会被换掉 */}
      <ProductModal />
    </>
  );
});
