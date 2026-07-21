import { useEffect } from "react";
import { observer } from "mobx-react";
import { AlertCircle, PackageOpen } from "lucide-react";
import { useNavigate } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EUserWorkspaceRoles } from "@plane/types";
import { Breadcrumbs, Header, Loader } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useProductsContext } from "./context";
import { ProductTopNavigation } from "./product-top-navigation";

type TProductDetailsLayoutProps = {
  children: React.ReactNode;
  workspaceSlug: string;
  productId: string;
};

const ProductDetailLoading = () => (
  <>
    <AppHeader
      header={
        <Header>
          <Header.LeftItem>
            <Loader.Item width="96px" height="16px" />
          </Header.LeftItem>
        </Header>
      }
    />
    <ContentWrapper>
      <div className="flex h-full min-h-80 items-center justify-center bg-surface-1 p-6">
        <div className="w-full max-w-sm space-y-3">
          <Loader.Item height="18px" />
          <Loader.Item height="12px" />
          <Loader.Item height="12px" />
        </div>
      </div>
    </ContentWrapper>
  </>
);

const ProductDetailError = ({ workspaceSlug }: { workspaceSlug: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <>
      <PageHead title={t("workspace_products.detail.error_title")} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={t("workspace_products.title")}
                      icon={<PackageOpen className="size-4 text-secondary" />}
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
        <div className="flex h-full min-h-80 items-center justify-center bg-surface-1 p-6">
          <div className="max-w-sm text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-danger-subtle text-danger-primary">
              <AlertCircle className="size-5" />
            </span>
            <h1 className="mt-3 text-14 font-medium text-primary">{t("workspace_products.detail.error_title")}</h1>
            <p className="mt-1 text-12 leading-5 text-secondary">{t("workspace_products.detail.error_description")}</p>
            <Button className="mt-4" variant="secondary" onClick={() => navigate(`/${workspaceSlug}/products`)}>
              {t("workspace_products.detail.back_to_products")}
            </Button>
          </div>
        </div>
      </ContentWrapper>
    </>
  );
};

export const ProductDetailsLayout = observer(function ProductDetailsLayout(props: TProductDetailsLayoutProps) {
  const { children, workspaceSlug, productId } = props;
  const { data: currentUser } = useUser();
  const { workspaceInfoBySlug, hasAllWorkspacePermissions } = useUserPermissions();
  const { products, fetchProduct, detailError, detailErrorProductId } = useProductsContext();
  const currentProduct = products.find((product) => product.id === productId);
  const workspaceInfo = workspaceInfoBySlug(workspaceSlug);
  const isWorkspaceAdmin =
    workspaceInfo?.role === EUserWorkspaceRoles.ADMIN || hasAllWorkspacePermissions(workspaceSlug);
  const canManage = Boolean(currentProduct && (isWorkspaceAdmin || currentProduct.owner === currentUser?.id));
  const hasDetailError = detailErrorProductId === productId && Boolean(detailError);
  const isInitialLoading = !currentProduct && !hasDetailError;

  useEffect(() => {
    void fetchProduct(productId).catch(() => undefined);
  }, [fetchProduct, productId]);

  return (
    <>
      <ProductTopNavigation workspaceSlug={workspaceSlug} productId={productId} canManage={canManage} />
      {hasDetailError ? (
        <ProductDetailError workspaceSlug={workspaceSlug} />
      ) : isInitialLoading ? (
        <ProductDetailLoading />
      ) : (
        children
      )}
    </>
  );
});
