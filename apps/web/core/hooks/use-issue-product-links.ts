import { useCallback, useContext } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue, TIssueProductLink, TIssueProductsResponse } from "@plane/types";
import { IssueService } from "@/services/issue/issue.service";
import { StoreContext } from "@/lib/store-context";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssues } from "@/hooks/store/use-issues";

const issueService = new IssueService();

/** 后端错误码 → 提示文案（规则在后端 utils/issue_product.py） */
const PRODUCT_ERROR_MESSAGES: Record<string, string> = {
  ISSUE_DEFECT_PRODUCT_REQUIRED: "缺陷至少关联一个产品",
  ISSUE_PRODUCT_SINGLE_ONLY: "非缺陷工作项只能关联一个产品",
  ISSUE_PRODUCT_NOT_LINKED_TO_PROJECT: "产品未关联到本项目",
  ISSUE_PRODUCT_MODULE_NOT_IN_PRODUCT: "产品模块不属于该产品",
  ISSUE_PRODUCT_NOT_FOUND: "该产品未关联到此工作项",
};

export const issueProductErrorMessage = (error: unknown): string => {
  const codes = (error as { products?: string[]; product_id?: string[] | string } | undefined) ?? {};
  const code = Array.isArray(codes.products) ? codes.products[0] : undefined;
  if (code && PRODUCT_ERROR_MESSAGES[code]) return PRODUCT_ERROR_MESSAGES[code];
  if (typeof codes.product_id === "string") return codes.product_id;
  return "产品关联保存失败";
};

/**
 * 工作项「关联产品」的增删改：调接口后把 product_id / product_ids / products 写回本地，
 * 当前布局的分组（按产品分组时一条缺陷在多个组里）一并重排，不整页重刷。
 */
export const useIssueProductLinks = (workspaceSlug: string, projectId: string, issueId: string) => {
  const context = useContext(StoreContext);
  const storeType = useIssueStoreType();
  const { issues } = useIssues(storeType) as {
    issues?: {
      issueUpdate?: (ws: string, pid: string, id: string, data: Partial<TIssue>, shouldSync?: boolean) => unknown;
    };
  };

  const applyLocal = useCallback(
    (res: TIssueProductsResponse) => {
      const patch: Partial<TIssue> = {
        product_id: res.product_id,
        product_module_id: res.product_module_id,
        product_ids: res.product_ids,
        product_module_ids: res.products
          .map((item) => item.product_module_id)
          .filter((id): id is string => !!id),
        products: res.products,
        product_name: res.products[0]?.product_name ?? null,
        product_module_name: res.products[0]?.product_module_name ?? null,
      };
      if (issues?.issueUpdate) void issues.issueUpdate(workspaceSlug, projectId, issueId, patch, false);
      else context?.issue.issues.updateIssue(issueId, patch);
      return res;
    },
    [context, issues, workspaceSlug, projectId, issueId]
  );

  const run = useCallback(
    async (request: () => Promise<TIssueProductsResponse>) => {
      try {
        return applyLocal(await request());
      } catch (error) {
        setToast({ type: TOAST_TYPE.ERROR, title: "操作失败", message: issueProductErrorMessage(error) });
        throw error;
      }
    },
    [applyLocal]
  );

  const fetchProducts = useCallback(
    () => run(() => issueService.getIssueProducts(workspaceSlug, projectId, issueId)),
    [run, workspaceSlug, projectId, issueId]
  );
  const addProducts = useCallback(
    (productIds: string[]) => run(() => issueService.addIssueProducts(workspaceSlug, projectId, issueId, productIds)),
    [run, workspaceSlug, projectId, issueId]
  );
  const setProducts = useCallback(
    (products: Pick<TIssueProductLink, "product_id" | "product_module_id">[]) =>
      run(() => issueService.setIssueProducts(workspaceSlug, projectId, issueId, products)),
    [run, workspaceSlug, projectId, issueId]
  );
  const updateModule = useCallback(
    (productId: string, productModuleId: string | null) =>
      run(() => issueService.updateIssueProductModule(workspaceSlug, projectId, issueId, productId, productModuleId)),
    [run, workspaceSlug, projectId, issueId]
  );
  const removeProduct = useCallback(
    (productId: string) => run(() => issueService.removeIssueProduct(workspaceSlug, projectId, issueId, productId)),
    [run, workspaceSlug, projectId, issueId]
  );

  return { fetchProducts, addProducts, setProducts, updateModule, removeProduct };
};
