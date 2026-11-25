import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import type { TIssueServiceType } from "@plane/types";
import { Collapsible, CollapsibleButton } from "@plane/ui";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueProductLinks } from "@/hooks/use-issue-product-links";
import { useIsDefectWorkItem } from "../work-item-risks";
import { IssueAddProductsModal } from "./add-products-modal";
import { IssueProductsCollapsibleContent } from "./content";

/** 快捷按钮组里的「产品」按钮通过这个事件打开关联弹窗（弹窗挂在区块里） */
export const ISSUE_PRODUCTS_ADD_EVENT = "issue:products:add";

export const openIssueProductsModal = (issueId: string) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ISSUE_PRODUCTS_ADD_EVENT, { detail: { issueId } }));
};

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

/** 缺陷详情「产品」区块：缺陷可关联多个产品、至少一个；非缺陷不渲染（产品在属性栏单选）。 */
export const IssueProductsCollapsible = observer(function IssueProductsCollapsible(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, issueServiceType } = props;
  const {
    openWidgets,
    toggleOpenWidget,
    issue: { getIssueById },
  } = useIssueDetail(issueServiceType);
  const isDefect = useIsDefectWorkItem(workspaceSlug, projectId, issueId, issueServiceType);
  const issue = getIssueById(issueId);
  const { fetchProducts, addProducts, removeProduct } = useIssueProductLinks(
    workspaceSlug,
    projectId,
    issueId
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isOpen = openWidgets.includes("products");

  // 从列表进来的工作项没有 products 明细（列表拖拽换组后本地是产品 id 串），补拉一次
  const hasDetail =
    Array.isArray(issue?.products) && issue.products.every((item) => typeof item === "object" && !!item);
  const loadedIssueId = issue?.id;
  useEffect(() => {
    if (isDefect && loadedIssueId && !hasDetail) fetchProducts().catch(() => undefined);
  }, [isDefect, loadedIssueId, hasDetail, fetchProducts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ issueId?: string }>).detail;
      if (detail?.issueId !== issueId) return;
      setIsModalOpen(true);
      if (!openWidgets.includes("products")) toggleOpenWidget("products");
    };
    window.addEventListener(ISSUE_PRODUCTS_ADD_EVENT, handler);
    return () => window.removeEventListener(ISSUE_PRODUCTS_ADD_EVENT, handler);
  }, [issueId, openWidgets, toggleOpenWidget]);

  if (!isDefect || !issue) return null;
  const products = (issue.products ?? []).filter((item) => typeof item === "object" && !!item);

  // 照「用例」区块：没有关联产品时不显示区块，从快捷按钮组的「关联产品」添加（弹窗在区块外，照样能开）
  return (
    <>
      {products.length > 0 && (
      <Collapsible
        isOpen={isOpen}
        onToggle={() => toggleOpenWidget("products")}
        title={
          <CollapsibleButton
            isOpen={isOpen}
            title="产品"
            indicatorElement={
              <span className="flex items-center justify-center">
                <p className="text-base text-secondary !leading-3">{products.length}</p>
              </span>
            }
          />
        }
        buttonClassName="w-full"
      >
        <IssueProductsCollapsibleContent
          products={products}
          disabled={disabled}
          onRemove={(productId) => {
            removeProduct(productId).catch(() => undefined);
          }}
        />
      </Collapsible>
      )}
      <IssueAddProductsModal
        isOpen={isModalOpen}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        linkedProductIds={products.map((item) => item.product_id)}
        onClose={() => setIsModalOpen(false)}
        onSubmit={addProducts}
      />
    </>
  );
});
