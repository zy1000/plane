import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useProjectProduct } from "@/hooks/store/use-project-product";
import type { TDropdownProps } from "../types";
import { ProductDropdownBase } from "./base";

type TProductDropdownProps = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  projectId: string | undefined;
  onChange: (val: string | null) => void;
  onClose?: () => void;
  renderByDefault?: boolean;
  value: string | null;
  valueName?: string | null;
};

/** 候选 = 项目关联产品池；打开时懒拉，照 ReleaseDropdown。 */
export const ProductDropdown = observer(function ProductDropdown(props: TProductDropdownProps) {
  const { projectId } = props;
  const { workspaceSlug } = useParams();
  const { getProductById, getProjectProductIds, fetchProducts } = useProjectProduct();
  const productIds = projectId ? getProjectProductIds(projectId) : [];

  const onDropdownOpen = () => {
    if (!productIds && projectId && workspaceSlug) fetchProducts(workspaceSlug.toString(), projectId);
  };

  return (
    <ProductDropdownBase
      {...props}
      getProductById={getProductById}
      productIds={productIds ?? []}
      onDropdownOpen={onDropdownOpen}
    />
  );
});
