import { observer } from "mobx-react";
import { PackageOpen } from "lucide-react";
import { useParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useProductsContext } from "./context";
import { getProductNavigationItem } from "./navigation";
import type { TProductTabKey } from "./navigation";

type TProductFeaturePageProps = {
  tabKey: TProductTabKey;
};

export const ProductFeaturePage = observer(function ProductFeaturePage({ tabKey }: TProductFeaturePageProps) {
  const { t } = useTranslation();
  const { productId } = useParams();
  const { products } = useProductsContext();
  const product = products.find((item) => item.id === productId);
  const navigationItem = getProductNavigationItem(tabKey);
  const FeatureIcon = navigationItem.icon;
  const featureTitle = t(navigationItem.i18nKey);

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
                      icon={<FeatureIcon className="size-4 text-tertiary" />}
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
        <div className="flex h-full min-h-80 items-center justify-center bg-surface-1 px-6 py-10">
          <div className="flex max-w-md flex-col items-center text-center">
            <div className="relative mb-5 grid size-20 place-items-center rounded-2xl border border-subtle bg-layer-1 shadow-xs">
              <div className="absolute inset-2 rounded-xl border border-subtle bg-surface-1" />
              <FeatureIcon className="relative size-7 text-tertiary" strokeWidth={1.5} />
              <PackageOpen className="absolute -right-1.5 -bottom-1.5 size-6 rounded-md border border-subtle bg-surface-1 p-1.5 text-placeholder" />
            </div>
            <h1 className="text-16 font-semibold text-primary">{t(`workspace_products.features.${tabKey}.title`)}</h1>
            <p className="mt-2 text-13 leading-5 text-secondary">
              {t(`workspace_products.features.${tabKey}.description`)}
            </p>
          </div>
        </div>
      </ContentWrapper>
    </>
  );
});
