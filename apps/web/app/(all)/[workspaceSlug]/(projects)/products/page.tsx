import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProductsHeader, ProductsRoot } from "@/components/products";

export default function ProductsPage() {
  return (
    <>
      <AppHeader header={<ProductsHeader />} />
      <ContentWrapper>
        <ProductsRoot />
      </ContentWrapper>
    </>
  );
}
