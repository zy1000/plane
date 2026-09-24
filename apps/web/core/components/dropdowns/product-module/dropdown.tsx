import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { useProjectProduct } from "@/hooks/store/use-project-product";
import type { TDropdownProps } from "../types";
import { ProductModuleDropdownBase } from "./base";

type TProductModuleDropdownProps = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  projectId: string | undefined;
  /** 所属产品；为空时下拉禁用并提示先选产品 */
  productId: string | null | undefined;
  onChange: (val: string | null) => void;
  onClose?: () => void;
  renderByDefault?: boolean;
  value: string | null;
  valueName?: string | null;
};

/** 候选 = 所选产品的全量模块树（拍平带路径）；打开时懒拉。 */
export const ProductModuleDropdown = observer(function ProductModuleDropdown(props: TProductModuleDropdownProps) {
  const { projectId, productId, disabled, placeholder } = props;
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const { getProductModuleById, getProductModuleIds, fetchProductModules } = useProjectProduct();
  const moduleIds = productId ? getProductModuleIds(productId) : [];

  const onDropdownOpen = () => {
    if (!moduleIds && projectId && productId && workspaceSlug)
      fetchProductModules(workspaceSlug.toString(), projectId, productId);
  };

  return (
    <ProductModuleDropdownBase
      {...props}
      disabled={disabled || !productId}
      placeholder={productId ? placeholder : t("product_module_field.select_product_first")}
      getProductModuleById={getProductModuleById}
      moduleIds={moduleIds ?? []}
      onDropdownOpen={onDropdownOpen}
    />
  );
});
