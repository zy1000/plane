import { createContext, useContext, useMemo, useState } from "react";
import type { TProduct } from "@plane/types";
import { useProducts } from "@/hooks/store/use-products";

export type TProductModalMode = "view" | "create" | "edit";

type TProductModalState = {
  isOpen: boolean;
  mode: TProductModalMode;
  product: TProduct | null;
};

type TProductsContext = ReturnType<typeof useProducts> & {
  workspaceSlug: string;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  modal: TProductModalState;
  productToDelete: TProduct | null;
  openProductModal: (mode: TProductModalMode, product?: TProduct) => void;
  closeProductModal: () => void;
  setProductToDelete: (product: TProduct | null) => void;
};

const ProductsContext = createContext<TProductsContext | undefined>(undefined);

export function ProductsProvider(props: { children: React.ReactNode; workspaceSlug: string }) {
  const { children, workspaceSlug } = props;
  const products = useProducts(workspaceSlug);
  const [searchQuery, setSearchQuery] = useState("");
  const [modal, setModal] = useState<TProductModalState>({
    isOpen: false,
    mode: "view",
    product: null,
  });
  const [productToDelete, setProductToDelete] = useState<TProduct | null>(null);

  const openProductModal = (mode: TProductModalMode, product?: TProduct) => {
    setModal({ isOpen: true, mode, product: product ?? null });
    if (product) {
      void products
        .fetchProduct(product.id)
        .then((freshProduct) => {
          setModal((current) =>
            current.isOpen && current.product?.id === freshProduct.id ? { ...current, product: freshProduct } : current
          );
        })
        .catch(() => undefined);
    }
  };

  const closeProductModal = () => {
    setModal((current) => ({ ...current, isOpen: false }));
  };

  const value = useMemo<TProductsContext>(
    () => ({
      ...products,
      workspaceSlug,
      searchQuery,
      setSearchQuery,
      modal,
      productToDelete,
      openProductModal,
      closeProductModal,
      setProductToDelete,
    }),
    [modal, productToDelete, products, searchQuery, workspaceSlug]
  );

  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export const useProductsContext = () => {
  const context = useContext(ProductsContext);
  if (!context) throw new Error("useProductsContext must be used within ProductsProvider");
  return context;
};
