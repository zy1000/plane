import { useMemo } from "react";
import useSWR from "swr";
import type { TProductProject } from "@plane/types";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import { RepositoryService } from "@/services/qa";

/**
 * 项目里看产品用例时的「范围」：哪个关联产品、哪个用例库。
 * 用例归产品（2026-11），项目只是入口：一次看一个产品，记住上次看的产品和用例库。
 */

export type TScopeRepository = {
  id: string;
  name: string;
  caseCount?: number;
};

export type TScopeProductGroup = {
  productId: string;
  productName: string;
  productIdentifier: string;
  repositories: TScopeRepository[];
  /** 这个产品的用例库没取到（通常是没有该产品的用例查看权限） */
  failed: boolean;
};

const repositoryService = new RepositoryService();

const lastProductKey = (projectId: string) => `testhub_last_product_${projectId}`;
const lastRepositoryKey = (productId: string) => `testhub_last_repository_${productId}`;

const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

export const readLastProduct = (projectId: string) => readStorage(lastProductKey(projectId));
export const writeLastProduct = (projectId: string, productId: string) =>
  writeStorage(lastProductKey(projectId), productId);
export const readLastRepository = (productId: string) => readStorage(lastRepositoryKey(productId));
export const writeLastRepository = (productId: string, repositoryId: string) =>
  writeStorage(lastRepositoryKey(productId), repositoryId);

/** 进项目「测试用例 / 用例评审」时默认看哪个产品：上次看的还关联着就用它，否则第一个 */
export const pickDefaultProduct = (projectId: string, links: TProductProject[]): string | null => {
  const last = readLastProduct(projectId);
  if (last && links.some((link) => link.product === last)) return last;
  return links[0]?.product ?? null;
};

const fetchProductRepositories = async (
  workspaceSlug: string,
  link: TProductProject
): Promise<TScopeProductGroup> => {
  const base = {
    productId: link.product,
    productName: link.product_name,
    productIdentifier: link.product_identifier ?? "",
  };
  try {
    // 逐个产品取：其中一个没权限不影响其他产品
    const resp = await repositoryService.getRepositories(workspaceSlug, { product_id: link.product, page_size: 100 });
    const rows: any[] = Array.isArray(resp?.data) ? resp.data : [];
    return {
      ...base,
      failed: false,
      repositories: rows.map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        caseCount: typeof row.case_count === "number" ? row.case_count : undefined,
      })),
    };
  } catch {
    return { ...base, failed: true, repositories: [] };
  }
};

/** 项目已关联产品及各自的用例库（切换器、项目用例页共用一份 SWR 数据） */
export const useLinkedProductRepositories = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const { links, isLoading: linksLoading, error: linksError } = useProjectProducts({ workspaceSlug, projectId });
  const productIds = useMemo(() => links.map((link) => link.product).join(","), [links]);

  const {
    data,
    isLoading: repositoriesLoading,
    mutate,
  } = useSWR(
    workspaceSlug && projectId && links.length > 0
      ? `testhub-linked-repositories-${workspaceSlug}-${projectId}-${productIds}`
      : null,
    workspaceSlug ? () => Promise.all(links.map((link) => fetchProductRepositories(workspaceSlug, link))) : null,
    { revalidateOnFocus: false }
  );

  const groups = useMemo<TScopeProductGroup[]>(
    () =>
      data ??
      links.map((link) => ({
        productId: link.product,
        productName: link.product_name,
        productIdentifier: link.product_identifier ?? "",
        repositories: [],
        failed: false,
      })),
    [data, links]
  );

  return {
    links,
    groups,
    linksLoading,
    linksError,
    /** 关联产品已取到、各产品的用例库还在取 */
    repositoriesLoading: links.length > 0 && (repositoriesLoading || !data),
    hasNoLinkedProduct: !linksLoading && !linksError && links.length === 0,
    refresh: mutate,
  };
};
