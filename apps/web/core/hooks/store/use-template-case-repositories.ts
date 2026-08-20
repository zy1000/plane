import { useCallback, useEffect, useState } from "react";
import { RepositoryService } from "@/services/qa/repository.service";

const repositoryService = new RepositoryService();

export type TTemplateCaseRepository = {
  id: string;
  name: string;
  description: string;
  is_template: boolean;
  project: null;
  created_by?: { id: string; [key: string]: unknown } | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

type TFetchParams = {
  page?: number;
  pageSize?: number;
  search?: string;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "获取模板库失败，请稍后重试";
  }
  return "获取模板库失败，请稍后重试";
};

/**
 * 模板用例库（TestCaseRepository.is_template=true）列表与删除。
 * 创建/编辑由 RepositoryModal（templateMode）自行调 service，成功后调用方 refresh。
 * 列表是服务端分页（list_response），mutation 后按当前参数重拉。
 */
export const useTemplateCaseRepositories = (workspaceSlug: string | undefined) => {
  const [repositories, setRepositories] = useState<TTemplateCaseRepository[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (params?: TFetchParams) => {
      if (!workspaceSlug) return;
      const nextPage = params?.page ?? 1;
      const nextPageSize = params?.pageSize ?? pageSize;
      const nextSearch = params?.search ?? search;
      setIsLoading(true);
      setError(null);
      try {
        const queries: Record<string, unknown> = {
          is_template: true,
          page: nextPage,
          page_size: nextPageSize,
        };
        if (nextSearch) queries.name__icontains = nextSearch;
        const response = await repositoryService.getRepositories(workspaceSlug, queries);
        setRepositories(response?.data ?? []);
        setCount(Number(response?.count ?? 0));
        setPage(nextPage);
        setPageSize(nextPageSize);
        setSearch(nextSearch);
      } catch (requestError) {
        setError(getErrorMessage(requestError));
        throw requestError;
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize, search, workspaceSlug]
  );

  useEffect(() => {
    if (!workspaceSlug) return;
    void fetchPage({ page: 1, search: "" }).catch(() => undefined);
    // 仅在工作区变化时重置拉取，避免 fetchPage 引用变化导致重复请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug]);

  const refreshCurrentPage = useCallback(
    () => fetchPage({ page, pageSize, search }).catch(() => undefined),
    [fetchPage, page, pageSize, search]
  );

  const deleteRepositories = useCallback(
    async (repositoryIds: string[]) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      if (repositoryIds.length === 0) return;
      setIsMutating(true);
      try {
        await repositoryService.deleteRepository(workspaceSlug, { ids: repositoryIds });
        await fetchPage({ page: 1 }).catch(() => undefined);
      } finally {
        setIsMutating(false);
      }
    },
    [fetchPage, workspaceSlug]
  );

  return {
    repositories,
    count,
    page,
    pageSize,
    search,
    isLoading,
    isMutating,
    error,
    fetchPage,
    refreshCurrentPage,
    deleteRepositories,
  };
};
