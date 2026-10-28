import { useCallback, useEffect, useState } from "react";
import type { TProductCategory } from "@plane/types";
import { ProductCategoryService } from "@/services/product-category.service";

const service = new ProductCategoryService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load product categories.";
  }
  return "Unable to load product categories.";
};

const sortCategories = (categories: TProductCategory[]) =>
  [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

/**
 * 工作区产品分类（局部 state）：分类页与标准库弹窗里的分类下拉共用。
 *
 * 模块的增删改排后端都返回整个分类，这里直接替换那一条；排序先乐观改本地，失败回滚。
 * workspaceSlug 传 undefined 时不拉（弹窗关着时）。
 */
export const useProductCategories = (workspaceSlug: string | undefined) => {
  const [categories, setCategories] = useState<TProductCategory[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upsertCategory = useCallback((category: TProductCategory) => {
    setCategories((current) => {
      const exists = current.some((item) => item.id === category.id);
      const next = exists
        ? current.map((item) => (item.id === category.id ? category : item))
        : [...current, category];
      return sortCategories(next);
    });
  }, []);

  const fetchCategories = useCallback(async () => {
    if (!workspaceSlug) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await service.list(workspaceSlug);
      setCategories(sortCategories(response));
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void fetchCategories().catch(() => undefined);
  }, [fetchCategories]);

  /** 写操作的公共外壳：校验工作区、置 isMutating、成功后把返回的分类写回本地 */
  const mutate = useCallback(
    async (request: (slug: string) => Promise<TProductCategory>) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await request(workspaceSlug);
        upsertCategory(response);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [upsertCategory, workspaceSlug]
  );

  const createCategory = useCallback(
    (name: string) => mutate((slug) => service.create(slug, { name })),
    [mutate]
  );

  const renameCategory = useCallback(
    (categoryId: string, name: string) => mutate((slug) => service.update(slug, categoryId, { name })),
    [mutate]
  );

  const deleteCategory = useCallback(
    async (categoryId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        await service.deleteCategory(workspaceSlug, categoryId);
        setCategories((current) => current.filter((item) => item.id !== categoryId));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  const reorderCategories = useCallback(
    async (orderedIds: string[]) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      const previous = categories;
      const byId = new Map(categories.map((item) => [item.id, item]));
      setCategories(
        orderedIds.flatMap((id, index) => {
          const item = byId.get(id);
          return item ? [{ ...item, sort_order: (index + 1) * 10000 }] : [];
        })
      );
      try {
        const response = await service.reorder(workspaceSlug, orderedIds);
        setCategories(sortCategories(response));
      } catch (requestError) {
        setCategories(previous);
        throw requestError;
      }
    },
    [categories, workspaceSlug]
  );

  const bulkCreateModules = useCallback(
    async (categoryId: string, names: string[]) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await service.bulkCreateModules(workspaceSlug, categoryId, names);
        upsertCategory(response.category);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [upsertCategory, workspaceSlug]
  );

  const renameModule = useCallback(
    (categoryId: string, moduleId: string, name: string) =>
      mutate((slug) => service.updateModule(slug, categoryId, moduleId, { name })),
    [mutate]
  );

  const deleteModule = useCallback(
    (categoryId: string, moduleId: string) => mutate((slug) => service.deleteModule(slug, categoryId, moduleId)),
    [mutate]
  );

  const reorderModules = useCallback(
    async (categoryId: string, orderedIds: string[]) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      const previous = categories.find((item) => item.id === categoryId);
      if (!previous) return;
      const byId = new Map(previous.modules.map((module) => [module.id, module]));
      upsertCategory({
        ...previous,
        modules: orderedIds.flatMap((id, index) => {
          const module = byId.get(id);
          return module ? [{ ...module, sort_order: (index + 1) * 10000 }] : [];
        }),
      });
      try {
        upsertCategory(await service.reorderModules(workspaceSlug, categoryId, orderedIds));
      } catch (requestError) {
        upsertCategory(previous);
        throw requestError;
      }
    },
    [categories, upsertCategory, workspaceSlug]
  );

  return {
    categories,
    isLoading,
    isMutating,
    error,
    fetchCategories,
    createCategory,
    renameCategory,
    deleteCategory,
    reorderCategories,
    bulkCreateModules,
    renameModule,
    deleteModule,
    reorderModules,
  };
};

export type TProductCategoriesStore = ReturnType<typeof useProductCategories>;
