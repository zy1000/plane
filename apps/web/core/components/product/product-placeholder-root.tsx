import { useParams } from "next/navigation";
import { useOutletContext } from "react-router";
import { Package } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useAppRouter } from "@/hooks/use-app-router";
import type { TProductDetailOutletContext } from "./product-detail-layout";
import { PRODUCT_NAVIGATION_ITEMS } from "./product-navigation";

export function ProductPlaceholderRoot() {
  const { productView, workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const router = useAppRouter();
  const { error, isLoading, product, refetchProduct } = useOutletContext<TProductDetailOutletContext>();
  const currentItem = PRODUCT_NAVIGATION_ITEMS.find((item) => item.key === productView);
  const pageLabel = currentItem?.label ?? "产品页面";
  const PageIcon = currentItem?.icon ?? Package;

  return (
    <>
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label="产品管理"
                      href={slug ? `/${slug}/products` : undefined}
                      icon={<Package className="size-4 text-tertiary" />}
                    />
                  }
                />
                {product && <Breadcrumbs.Item component={<BreadcrumbLink label={product.name} />} />}
                <Breadcrumbs.Item component={<BreadcrumbLink label={pageLabel} />} />
              </Breadcrumbs>
            </Header.LeftItem>
          </Header>
        }
      />
      <ContentWrapper>
        <PageHead title={product ? `${product.name} - ${pageLabel}` : pageLabel} />
        {isLoading ? (
          <div className="grid h-full place-items-center p-6">
            <div className="flex w-full max-w-sm animate-pulse flex-col items-center">
              <div className="size-12 rounded-xl bg-layer-2" />
              <div className="mt-4 h-4 w-24 rounded bg-layer-2" />
              <div className="mt-3 h-3 w-64 max-w-full rounded bg-layer-1" />
            </div>
          </div>
        ) : error || !product ? (
          <div className="grid h-full place-items-center p-6">
            <div className="max-w-sm text-center">
              <p className="text-15 font-medium text-primary">无法打开产品</p>
              <p className="mt-1 text-13 leading-5 text-secondary">产品不存在，或你没有访问权限。</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="secondary" size="lg" onClick={() => void refetchProduct()}>
                  重新加载
                </Button>
                <Button variant="secondary" size="lg" onClick={() => router.push(`/${slug}/products`)}>
                  返回产品列表
                </Button>
              </div>
            </div>
          </div>
        ) : !currentItem ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <p className="text-15 font-medium text-primary">页面不存在</p>
              <p className="mt-1 text-13 text-secondary">请选择产品菜单继续。</p>
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center p-6">
            <div className="max-w-md text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-xl border border-subtle bg-layer-1">
                <PageIcon className="size-5 text-secondary" />
              </span>
              <h1 className="mt-4 text-16 font-semibold text-primary">{currentItem.label}</h1>
              <p className="mt-1 text-13 leading-5 text-secondary">{currentItem.placeholderDescription}</p>
              <p className="mt-2 text-12 text-tertiary">该功能正在建设中</p>
            </div>
          </div>
        )}
      </ContentWrapper>
    </>
  );
}
