import { useCallback, useMemo, useState } from "react";
import {
  ProductService,
  type TProductCreatePayload,
  type TProductUpdatePayload,
  type TWorkspaceProduct,
} from "@/services/product.service";

const productService = new ProductService();

export const useProducts = (workspaceSlug?: string) => {
  const [products, setProducts] = useState<TWorkspaceProduct[]>([]);
  const [product, setProduct] = useState<TWorkspaceProduct | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const fetchProducts = useCallback(async () => {
    if (!workspaceSlug) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await productService.getProducts(workspaceSlug);
      setProducts(response);
      return response;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  const fetchProduct = useCallback(
    async (productId: string) => {
      if (!workspaceSlug || !productId) return undefined;
      setIsLoading(true);
      setError(null);
      try {
        const response = await productService.getProduct(workspaceSlug, productId);
        setProduct(response);
        return response;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [workspaceSlug]
  );

  const createProduct = useCallback(
    async (data: TProductCreatePayload) => {
      if (!workspaceSlug) throw new Error("缺少工作区参数");
      setIsMutating(true);
      try {
        const response = await productService.createProduct(workspaceSlug, data);
        setProducts((current) => [response, ...current.filter((item) => item.id !== response.id)]);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  const updateProduct = useCallback(
    async (productId: string, data: TProductUpdatePayload) => {
      if (!workspaceSlug) throw new Error("缺少工作区参数");
      setIsMutating(true);
      try {
        const response = await productService.updateProduct(workspaceSlug, productId, data);
        setProduct(response);
        setProducts((current) => current.map((item) => (item.id === response.id ? response : item)));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  const deleteProduct = useCallback(
    async (productId: string) => {
      if (!workspaceSlug) throw new Error("缺少工作区参数");
      setIsMutating(true);
      try {
        await productService.deleteProduct(workspaceSlug, productId);
        setProducts((current) => current.filter((item) => item.id !== productId));
        setProduct((current) => (current?.id === productId ? null : current));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  return useMemo(
    () => ({
      products,
      product,
      isLoading,
      isMutating,
      error,
      fetchProducts,
      fetchProduct,
      createProduct,
      updateProduct,
      deleteProduct,
    }),
    [
      createProduct,
      deleteProduct,
      error,
      fetchProduct,
      fetchProducts,
      isLoading,
      isMutating,
      product,
      products,
      updateProduct,
    ]
  );
};
