import { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import { ChevronDown, MoreHorizontal, PackageOpen, Settings } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Menu } from "@plane/propel/menu";
import { TabNavigationItem, TabNavigationList } from "@plane/propel/tab-navigation";
import type { ICustomSearchSelectOption, TProduct } from "@plane/types";
import { CustomSearchSelect, Header, Loader, Row, Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import { useResponsiveTabLayout } from "@/components/navigation/use-responsive-tab-layout";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useAppRouter } from "@/hooks/use-app-router";
import { useProductsContext } from "./context";
import { getProductTabPath, PRODUCT_NAVIGATION_ITEMS } from "./navigation";
import { buildProductSettingsPath } from "./settings/navigation";

type TProductTopNavigationProps = {
  workspaceSlug: string;
  productId: string;
  canManage: boolean;
};

type TProductRouteNavigationItem = (typeof PRODUCT_NAVIGATION_ITEMS)[number] & {
  href: string;
};

function ProductSwitcherButton({ product }: { product: TProduct }) {
  return (
    <Tooltip tooltipContent={product.name} position="bottom">
      <div className="relative flex w-full max-w-48 items-center pr-1 text-left select-none">
        <div className="flex size-7 flex-shrink-0 items-center justify-center rounded-md bg-layer-1 text-secondary">
          {product.logo_props?.in_use ? <Logo logo={product.logo_props} size={16} /> : <PackageOpen className="size-4" />}
        </div>
        <div className="relative min-w-0 flex-1 hover:rounded">
          <p className="truncate px-2 text-14 font-medium text-secondary">{product.name}</p>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <div className="relative flex h-full w-8 items-center justify-end">
              <div className="absolute inset-0 rounded-r bg-gradient-to-r from-transparent to-surface-2" />
              <ChevronDown className="relative z-10 size-4 text-tertiary" />
            </div>
          </div>
        </div>
      </div>
    </Tooltip>
  );
}

const ProductNavigationItem = ({
  item,
  isActive,
  itemRef,
}: {
  item: TProductRouteNavigationItem;
  isActive: boolean;
  itemRef?: (element: HTMLDivElement | null) => void;
}) => {
  const { t } = useTranslation();

  return (
    <div className="relative flex h-full items-center transition-all duration-300">
      {isActive && (
        <span className="absolute -bottom-px left-1/2 h-0.5 w-[80%] -translate-x-1/2 rounded-t-md bg-(--text-color-icon-primary)" />
      )}
      <div ref={itemRef}>
        <Link to={item.href}>
          <TabNavigationItem isActive={isActive}>
            <span>{t(item.i18nKey)}</span>
          </TabNavigationItem>
        </Link>
      </div>
    </div>
  );
};

const ProductNavigationOverflow = ({
  items,
  isActive,
}: {
  items: TProductRouteNavigationItem[];
  isActive: (item: TProductRouteNavigationItem) => boolean;
}) => {
  const { t } = useTranslation();
  const hasActiveItem = items.some(isActive);

  return (
    <Menu
      customButton={
        <div
          className={cn("flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-layer-1", {
            "bg-layer-transparent-active text-primary": hasActiveItem,
          })}
        >
          <MoreHorizontal className="size-4 text-secondary" />
        </div>
      }
      optionsClassName="min-w-40 space-y-1"
    >
      {items.map((item) => (
        <Menu.MenuItem key={item.key} className="w-full p-0">
          <Link
            to={item.href}
            className={cn("block w-full rounded-sm px-2 py-1.5 text-11 text-secondary hover:text-primary", {
              "bg-layer-transparent-active text-primary": isActive(item),
            })}
          >
            {t(item.i18nKey)}
          </Link>
        </Menu.MenuItem>
      ))}
    </Menu>
  );
};

const ProductNavigationRoot = observer(function ProductNavigationRoot(props: TProductTopNavigationProps) {
  const { workspaceSlug, productId, canManage } = props;
  const { t } = useTranslation();
  const router = useAppRouter();
  const { pathname, search } = useLocation();
  const { products } = useProductsContext();
  const currentProduct = products.find((product) => product.id === productId);

  const navigationItems = useMemo<TProductRouteNavigationItem[]>(
    () =>
      PRODUCT_NAVIGATION_ITEMS.filter((item) => !item.managerOnly || canManage).map((item) => ({
        key: item.key,
        icon: item.icon,
        i18nKey: item.i18nKey,
        managerOnly: item.managerOnly,
        href: getProductTabPath(workspaceSlug, productId, item.key),
      })),
    [canManage, productId, workspaceSlug]
  );
  const switcherOptions = useMemo<ICustomSearchSelectOption[]>(
    () =>
      products.map((product) => ({
        value: product.id,
        query: product.name,
        content: (
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded bg-layer-1 text-secondary">
              {product.logo_props?.in_use ? (
                <Logo logo={product.logo_props} size={14} />
              ) : (
                <PackageOpen className="size-3.5" />
              )}
            </span>
            <span className="truncate text-12 text-primary">{product.name}</span>
          </div>
        ),
      })),
    [products]
  );
  const isActive = useCallback(
    (item: TProductRouteNavigationItem) => pathname === item.href || pathname === `${item.href}/`,
    [pathname]
  );
  const { visibleItems, overflowItems, hasOverflow, itemRefs, containerRef } = useResponsiveTabLayout({
    visibleNavigationItems: navigationItems,
    hiddenNavigationItems: [],
    isActive,
  });

  const handleProductChange = useCallback(
    (nextProductId: string) => {
      if (nextProductId !== productId) router.push(getProductTabPath(workspaceSlug, nextProductId, "requirements"));
    },
    [productId, router, workspaceSlug]
  );

  return (
    <div className="flex size-full items-center gap-3 overflow-hidden">
      <div className="flex h-full shrink-0 items-center gap-2">
        <Link to={`/${workspaceSlug}/products`} className="cursor-pointer text-13 font-medium text-primary">
          {t("workspace_products.title")}
        </Link>
        <div className="mx-2 h-5 w-px shrink-0 border-l border-subtle" />
        {currentProduct ? (
          <>
            <CustomSearchSelect
              options={switcherOptions}
              value={currentProduct.id}
              onChange={handleProductChange}
              customButton={<ProductSwitcherButton product={currentProduct} />}
              className="h-full rounded"
              customButtonClassName="group flex h-full cursor-pointer items-center gap-0.5 rounded-sm outline-none hover:bg-surface-2"
              optionsClassName="min-w-64"
              noResultsMessage={t("workspace_products.navigation.no_products")}
            />
            {canManage && (
              <Tooltip tooltipContent={t("workspace_products.navigation.product_settings")} position="bottom">
                <Link
                  to={buildProductSettingsPath({
                    currentPath: `${pathname}${search}`,
                    productId,
                    workspaceSlug,
                  })}
                  className="ml-1 flex size-6 shrink-0 items-center justify-center rounded text-tertiary transition-colors hover:bg-surface-2 hover:text-secondary"
                  aria-label={t("workspace_products.navigation.product_settings")}
                >
                  <Settings className="size-3.5" />
                </Link>
              </Tooltip>
            )}
          </>
        ) : (
          <Loader.Item width="160px" height="28px" />
        )}
      </div>

      {currentProduct && (
        <>
          <div className="h-5 w-px shrink-0 border-l border-subtle" />
          <div ref={containerRef} className="relative flex h-full min-w-0 flex-1 items-center overflow-hidden">
            <TabNavigationList className="h-full">
              {visibleItems.map((item) => {
                const originalIndex = navigationItems.indexOf(item);
                return (
                  <ProductNavigationItem
                    key={item.key}
                    item={item}
                    isActive={isActive(item)}
                    itemRef={(element) => {
                      itemRefs.current[originalIndex] = element;
                    }}
                  />
                );
              })}
              {hasOverflow && <ProductNavigationOverflow items={overflowItems} isActive={isActive} />}
            </TabNavigationList>

            {hasOverflow && (
              <div className="pointer-events-none absolute -z-10 flex opacity-0">
                {navigationItems.map((item, index) => (
                  <div
                    key={`product-navigation-measure-${item.key}`}
                    ref={(element) => {
                      itemRefs.current[index] = element;
                    }}
                  >
                    <TabNavigationItem isActive={isActive(item)}>
                      <span>{t(item.i18nKey)}</span>
                    </TabNavigationItem>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});

export const ProductTopNavigation = observer(function ProductTopNavigation(props: TProductTopNavigationProps) {
  const { sidebarCollapsed } = useAppTheme();

  return (
    <div className="z-20">
      <Row className="flex h-header w-full items-center gap-2 border-b border-subtle bg-surface-1">
        <div className="flex size-full flex-1 items-center gap-2">
          <Header className={cn("h-full", { "pl-1.5": !sidebarCollapsed })}>
            <Header.LeftItem className="flex h-full w-full max-w-full items-center gap-2">
              <ProductNavigationRoot {...props} />
            </Header.LeftItem>
          </Header>
        </div>
      </Row>
    </div>
  );
});
