import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProductsHeader, ProductsRoot } from "@/components/products";
import { ProductSetsRoot } from "@/components/products/sets/product-sets-root";
import { useIsProductSetsTab } from "@/components/products/sets/use-products-list-tab";

export default function ProductsPage() {
  const isSetsTab = useIsProductSetsTab();

  return (
    <>
      <AppHeader header={<ProductsHeader />} />
      <ContentWrapper className="!overflow-hidden">{isSetsTab ? <ProductSetsRoot /> : <ProductsRoot />}</ContentWrapper>
    </>
  );
}
