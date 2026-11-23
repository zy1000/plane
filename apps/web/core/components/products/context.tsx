import { createContext, useContext, useMemo, useState } from "react";
import type { TProduct, TProductSet } from "@plane/types";
import { useProductSets } from "@/hooks/store/use-product-sets";
import { useProducts } from "@/hooks/store/use-products";
import type { TProductRichFilter } from "./filters/use-product-list-filter";
import { useProductListFilterInstance } from "./filters/use-product-list-filter";

export type TProductModalMode = "view" | "create" | "edit";

export type TProductModalState = {
  isOpen: boolean;
  mode: TProductModalMode;
  product: TProduct | null;
};

/** 产品集的创建 / 编辑弹窗：productSet 为空是创建 */
export type TProductSetModalState = {
  isOpen: boolean;
  productSet: TProductSet | null;
};

type TProductsContext = ReturnType<typeof useProducts> & {
  workspaceSlug: string;
  /** 产品集列表与增删改（列表页的「产品集」页签、详情页的切换器与编辑入口共用） */
  sets: ReturnType<typeof useProductSets>;
  productSetModal: TProductSetModalState;
  openProductSetModal: (productSet?: TProductSet) => void;
  closeProductSetModal: () => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  /** 列表页的富筛选实例（页头漏斗 + 筛选行共用），属性配置由列表页根注册 */
  filter: TProductRichFilter;
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
  const sets = useProductSets(workspaceSlug);
  const [productSetModal, setProductSetModal] = useState<TProductSetModalState>({ isOpen: false, productSet: null });
  const filter = useProductListFilterInstance(workspaceSlug);
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

  const openProductSetModal = (productSet?: TProductSet) => {
    setProductSetModal({ isOpen: true, productSet: productSet ?? null });
  };

  // 只收起、不清对象：关闭动画期间标题和表单不跳变
  const closeProductSetModal = () => {
    setProductSetModal((current) => ({ ...current, isOpen: false }));
  };

  const value = useMemo<TProductsContext>(
    () => ({
      ...products,
      workspaceSlug,
      sets,
      productSetModal,
      openProductSetModal,
      closeProductSetModal,
      searchQuery,
      setSearchQuery,
      filter,
      modal,
      productToDelete,
      openProductModal,
      closeProductModal,
      setProductToDelete,
    }),
    [filter, modal, productSetModal, productToDelete, products, searchQuery, sets, workspaceSlug]
  );

  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export const useProductsContext = () => {
  const context = useContext(ProductsContext);
  if (!context) throw new Error("useProductsContext must be used within ProductsProvider");
  return context;
};

/** 不在 ProductsProvider 里时返回 undefined —— 给产品页内外都会用到的共享组件（如建行弹窗）取产品信息 */
export const useOptionalProductsContext = () => useContext(ProductsContext);
