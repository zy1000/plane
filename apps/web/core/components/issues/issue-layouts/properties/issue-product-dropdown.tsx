import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue } from "@plane/types";
// components
import { ProductDropdown } from "@/components/dropdowns/product/dropdown";
import { ProductModuleDropdown } from "@/components/dropdowns/product-module/dropdown";
import type { TDropdownProps } from "@/components/dropdowns/types";
import { useIsDefectIssueType } from "@/components/issues/issue-detail-widgets/work-item-risks";
// hooks
import { useIssueProductLinks } from "@/hooks/use-issue-product-links";

type TStyleProps = Pick<
  TDropdownProps,
  "buttonClassName" | "buttonContainerClassName" | "buttonVariant" | "disabled" | "placeholder" | "showTooltip"
> & {
  onClose?: () => void;
  renderByDefault?: boolean;
};

/** 行上的全部关联产品；只带了单值的接口（个人主页等）退回 product_id */
export const getIssueProductIds = (issue: TIssue): string[] =>
  issue.product_ids ?? (issue.product_id ? [issue.product_id] : []);

/** 单值写入时一并改本地的 product_ids，按产品分组的列表才能即时挪组（后端忽略这两个键） */
export const singleProductPatch = (productId: string | null): Partial<TIssue> => ({
  product_id: productId,
  product_module_id: null,
  product_ids: productId ? [productId] : [],
  product_module_ids: [],
});

type Props = TStyleProps & {
  issue: TIssue;
  /** 非缺陷：单值改产品（走各布局自己的 PATCH） */
  onSingleChange: (productId: string | null) => void;
};

/**
 * 列表 / 表格 / 看板里的「产品」：缺陷多选（增删分别调追加 / 解除接口，不动其余产品上的模块，
 * 至少留一个），其余类型单选。
 */
export const IssueProductPropertyDropdown = observer(function IssueProductPropertyDropdown(props: Props) {
  const { issue, onSingleChange, ...rest } = props;
  const { workspaceSlug } = useParams();
  const ws = workspaceSlug?.toString() ?? "";
  const projectId = issue.project_id ?? "";
  const isDefect = useIsDefectIssueType(ws, projectId, issue.type_id);
  const { addProducts, removeProduct } = useIssueProductLinks(ws, projectId, issue.id);

  if (!isDefect)
    return (
      <ProductDropdown
        {...rest}
        projectId={issue.project_id ?? undefined}
        value={issue.product_id ?? null}
        valueName={issue.product_name ?? null}
        onChange={(productId) => {
          if ((issue.product_id ?? null) === productId) return;
          onSingleChange(productId);
        }}
      />
    );

  const currentIds = getIssueProductIds(issue);
  const handleChange = async (productIds: string[]) => {
    if (productIds.length === 0) {
      setToast({ type: TOAST_TYPE.ERROR, title: "操作失败", message: "缺陷至少关联一个产品" });
      return;
    }
    const added = productIds.filter((id) => !currentIds.includes(id));
    const removed = currentIds.filter((id) => !productIds.includes(id));
    try {
      if (added.length) await addProducts(added);
      for (const id of removed) await removeProduct(id);
    } catch {
      // 提示已由 hook 给出
    }
  };

  return (
    <ProductDropdown
      {...rest}
      multiple
      projectId={issue.project_id ?? undefined}
      value={currentIds}
      valueName={issue.product_name ?? null}
      onChange={(ids) => void handleChange(ids)}
    />
  );
});

type ModuleProps = TStyleProps & {
  issue: TIssue;
  onChange: (moduleId: string | null) => void;
};

/** 产品模块：跟着行上的产品走；缺陷关联了多个产品时各产品的模块在详情「产品」区块里改，这里只显示。 */
export const IssueProductModulePropertyDropdown = observer(function IssueProductModulePropertyDropdown(
  props: ModuleProps
) {
  const { issue, onChange, disabled, ...rest } = props;
  const multipleProducts = getIssueProductIds(issue).length > 1;
  return (
    <ProductModuleDropdown
      {...rest}
      projectId={issue.project_id ?? undefined}
      productId={issue.product_id ?? null}
      value={issue.product_module_id ?? null}
      valueName={issue.product_module_name ?? null}
      onChange={(moduleId) => {
        if ((issue.product_module_id ?? null) === moduleId) return;
        onChange(moduleId);
      }}
      disabled={disabled || multipleProducts}
    />
  );
});
