import { useCallback, useEffect, useState } from "react";
import type { TCreateProductPayload, TProduct, TUpdateProductPayload } from "@plane/types";
import { ProductService } from "@/services/product.service";

const productService = new ProductService();

const upsertProduct = (products: TProduct[], productToUpsert: TProduct) => {
  const productIndex = products.findIndex((product) => product.id === productToUpsert.id);
  if (productIndex === -1) return [productToUpsert, ...products];

  return products.map((product) => (product.id === productToUpsert.id ? productToUpsert : product));
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load products.";
  }
  return "Unable to load products.";
};

export const useProducts = (workspaceSlug: string | undefined) => {
  const [products, setProducts] = useState<TProduct[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailErrorProductId, setDetailErrorProductId] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!workspaceSlug) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await productService.list(workspaceSlug);
      setProducts(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void fetchProducts().catch(() => undefined);
  }, [fetchProducts]);

  const fetchProduct = useCallback(
    async (productId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsDetailLoading(true);
      setDetailError(null);
      setDetailErrorProductId(null);
      try {
        const response = await productService.retrieve(workspaceSlug, productId);
        setProducts((current) => upsertProduct(current, response));
        return response;
      } catch (requestError) {
        setDetailError(getErrorMessage(requestError));
        setDetailErrorProductId(productId);
        throw requestError;
      } finally {
        setIsDetailLoading(false);
      }
    },
    [workspaceSlug]
  );

  const createProduct = useCallback(
    async (payload: TCreateProductPayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await productService.create(workspaceSlug, payload);
        setProducts((current) => [response, ...current.filter((product) => product.id !== response.id)]);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  const updateProduct = useCallback(
    async (productId: string, payload: TUpdateProductPayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await productService.update(workspaceSlug, productId, payload);
        setProducts((current) => upsertProduct(current, response));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  const deleteProduct = useCallback(
    async (productId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        await productService.deleteProduct(workspaceSlug, productId);
        setProducts((current) => current.filter((product) => product.id !== productId));
        setDetailError(null);
        setDetailErrorProductId(null);
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  return {
    products,
    isLoading,
    isDetailLoading,
    isMutating,
    error,
    detailError,
    detailErrorProductId,
    fetchProducts,
    fetchProduct,
    createProduct,
    updateProduct,
    deleteProduct,
  };
};
