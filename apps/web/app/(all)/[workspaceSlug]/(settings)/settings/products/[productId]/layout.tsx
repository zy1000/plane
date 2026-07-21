import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { observer } from "mobx-react";
import { Outlet, useNavigate, useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EUserWorkspaceRoles } from "@plane/types";
import { Loader } from "@plane/ui";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ProductsProvider, useProductsContext } from "@/components/products";
import { getProductSettingsActivePath } from "@/components/products/settings/navigation";
import { ProductSettingsSidebar } from "@/components/products/settings/sidebar";
import { SettingsMobileNav } from "@/components/settings/mobile/nav";
import { useUser, useUserPermissions } from "@/hooks/store/user";

const ProductSettingsLoading = () => (
  <div className="flex size-full bg-surface-1">
    <div className="hidden h-full w-[250px] shrink-0 border-r border-subtle p-5 md:block">
      <Loader className="space-y-4">
        <Loader.Item height="28px" />
        <Loader.Item height="38px" />
        <Loader.Item height="32px" />
        <Loader.Item height="32px" />
        <Loader.Item height="32px" />
      </Loader>
    </div>
    <div className="flex-1 p-6 md:p-10">
      <Loader className="mx-auto max-w-225 space-y-5">
        <Loader.Item height="28px" />
        <Loader.Item height="40px" />
        <Loader.Item height="180px" />
        <Loader.Item height="40px" />
      </Loader>
    </div>
  </div>
);

const ProductSettingsUnavailable = ({ workspaceSlug }: { workspaceSlug: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex size-full items-center justify-center bg-surface-1 px-6">
      <PageHead title={t("workspace_products.detail.error_title")} />
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-full bg-danger-subtle text-danger-primary">
          <AlertCircle className="size-5" />
        </span>
        <h1 className="mt-3 text-body-md-medium text-primary">{t("workspace_products.detail.error_title")}</h1>
        <p className="mt-1 text-body-sm-regular leading-5 text-tertiary">
          {t("workspace_products.detail.error_description")}
        </p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate(`/${workspaceSlug}/products`)}>
          {t("workspace_products.detail.back_to_products")}
        </Button>
      </div>
    </div>
  );
};

const ProductSettingsLayoutContent = observer(function ProductSettingsLayoutContent({
  productId,
  workspaceSlug,
}: {
  productId: string;
  workspaceSlug: string;
}) {
  const pathname = usePathname();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { workspaceInfoBySlug, hasAllWorkspacePermissions } = useUserPermissions();
  const { products, fetchProduct, detailError, detailErrorProductId } = useProductsContext();
  const product = products.find(({ id }) => id === productId);
  const workspaceInfo = workspaceInfoBySlug(workspaceSlug);
  const isWorkspaceAdmin =
    workspaceInfo?.role === EUserWorkspaceRoles.ADMIN || hasAllWorkspacePermissions(workspaceSlug);
  const canManage = Boolean(product && (isWorkspaceAdmin || product.owner === currentUser?.id));
  const hasDetailError = detailErrorProductId === productId && Boolean(detailError);

  useEffect(() => {
    void fetchProduct(productId).catch(() => undefined);
  }, [fetchProduct, productId]);

  if ((!product && !hasDetailError) || !currentUser) return <ProductSettingsLoading />;
  if (hasDetailError || !product) return <ProductSettingsUnavailable workspaceSlug={workspaceSlug} />;

  if (!canManage) {
    return (
      <NotAuthorizedView
        section="settings"
        isProjectView
        className="h-full"
        actionButton={
          <Button variant="secondary" onClick={() => navigate(`/${workspaceSlug}/products/${productId}/dashboard`)}>
            {t("workspace_products.settings.back_to_product")}
          </Button>
        }
      />
    );
  }

  return (
    <>
      <SettingsMobileNav
        hamburgerContent={(props) => (
          <ProductSettingsSidebar {...props} productId={productId} workspaceSlug={workspaceSlug} />
        )}
        activePath={getProductSettingsActivePath(pathname)}
      />
      <div className="inset-y-0 flex h-full w-full flex-row">
        <div className="relative flex size-full">
          <div className="hidden h-full shrink-0 md:block">
            <ProductSettingsSidebar productId={productId} workspaceSlug={workspaceSlug} />
          </div>
          <Outlet />
        </div>
      </div>
    </>
  );
});

const ProductSettingsRouteLayout = observer(function ProductSettingsRouteLayout() {
  const { workspaceSlug, productId } = useParams();
  const { workspaceInfoBySlug } = useUserPermissions();

  if (!workspaceSlug || !productId || !workspaceInfoBySlug(workspaceSlug)) return null;

  return (
    <ProductsProvider workspaceSlug={workspaceSlug}>
      <ProductSettingsLayoutContent productId={productId} workspaceSlug={workspaceSlug} />
    </ProductsProvider>
  );
});

export default ProductSettingsRouteLayout;
