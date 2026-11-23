import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PackageOpen, Search } from "lucide-react";
import { Link } from "react-router";
import { PERMISSION_KEYS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Breadcrumbs, Header } from "@plane/ui";
import { cn } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import { useUserPermissions } from "@/hooks/store/user";
import { useProductsContext } from "./context";
import { useIsProductSetsTab } from "./sets/use-products-list-tab";

function ListTab(props: { to: string; label: string; count: number; isActive: boolean; onClick: () => void }) {
  const { to, label, count, isActive, onClick } = props;
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-13",
        isActive ? "bg-layer-1 font-medium text-primary" : "text-secondary hover:bg-layer-1-hover"
      )}
    >
      {label}
      <span className="text-11 font-normal text-tertiary tabular-nums">{count}</span>
    </Link>
  );
}

export const ProductsHeader = observer(function ProductsHeader() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const { products, sets, searchQuery, setSearchQuery, filter, openProductModal, openProductSetModal } =
    useProductsContext();
  const isSetsTab = useIsProductSetsTab();
  const slug = workspaceSlug?.toString() ?? "";
  const canCreate = allowWorkspacePermissionKeys([PERMISSION_KEYS.WORKSPACE_PRODUCT_CREATE], slug);
  // 进过产品集详情后，那一条也会被放进 products（详情页靠它取当前对象），计数时排除
  const productCount = products.filter((product) => !product.is_set).length;
  const clearSearch = () => setSearchQuery("");

  return (
    <Header>
      <Header.LeftItem>
        {/* Breadcrumbs 自己会撑满剩余宽度，包一层让页签紧跟在标题后面 */}
        <div className="shrink-0">
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label={t("workspace_products.title")}
                  icon={<PackageOpen className="size-4 text-secondary" />}
                />
              }
            />
          </Breadcrumbs>
        </div>
        <div className="ml-1 flex items-center gap-1 border-l border-subtle pl-3">
          <ListTab
            to={`/${slug}/products`}
            label={t("workspace_product_sets.tabs.products")}
            count={productCount}
            isActive={!isSetsTab}
            onClick={clearSearch}
          />
          <ListTab
            to={`/${slug}/products?tab=sets`}
            label={t("workspace_product_sets.tabs.product_sets")}
            count={sets.productSets.length}
            isActive={isSetsTab}
            onClick={clearSearch}
          />
        </div>
      </Header.LeftItem>
      <Header.RightItem>
        <label className="relative block w-36 sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-placeholder" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t(
              isSetsTab ? "workspace_product_sets.search_placeholder" : "workspace_products.search_placeholder"
            )}
            className="focus:border-accent-primary h-8 w-full rounded-md border border-subtle bg-surface-1 pr-2 pl-8 text-12 text-primary outline-none placeholder:text-placeholder"
          />
        </label>
        {!isSetsTab && (
          <div className="hidden items-center md:flex">
            <FiltersToggle filter={filter} enableQuickAddFilter={false} />
          </div>
        )}
        {canCreate &&
          (isSetsTab ? (
            <Button variant="primary" size="lg" onClick={() => openProductSetModal()}>
              {t("workspace_product_sets.create")}
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={() => openProductModal("create")}>
              {t("workspace_products.create_product")}
            </Button>
          ))}
      </Header.RightItem>
    </Header>
  );
});
