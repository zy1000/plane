import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
// types
import type { TIssue } from "@plane/types";
// components
import { ProductModuleDropdown } from "@/components/dropdowns/product-module/dropdown";

type Props = {
  issue: TIssue;
  onClose: () => void;
  onChange: (issue: TIssue, data: Partial<TIssue>, updates: any) => void;
  disabled: boolean;
};

/** 产品模块跟着行上的产品走；产品为空时下拉禁用。 */
export const SpreadsheetProductModuleColumn = observer(function SpreadsheetProductModuleColumn(props: Props) {
  const { issue, onChange, disabled, onClose } = props;
  const { t } = useTranslation();

  return (
    <div className="h-11 border-b-[0.5px] border-subtle">
      <ProductModuleDropdown
        projectId={issue.project_id ?? undefined}
        productId={issue.product_id ?? null}
        value={issue.product_module_id ?? null}
        valueName={issue.product_module_name ?? null}
        onChange={(moduleId) => {
          if ((issue.product_module_id ?? null) === moduleId) return;
          onChange(
            issue,
            { product_module_id: moduleId },
            { changed_property: "product_module_id", change_details: moduleId }
          );
        }}
        disabled={disabled}
        placeholder={t("product_module_field.no_module")}
        buttonVariant="transparent-with-text"
        buttonContainerClassName="w-full relative flex items-center p-2 group-[.selected-issue-row]:bg-accent-primary/5 group-[.selected-issue-row]:hover:bg-accent-primary/10 px-page-x"
        buttonClassName="relative leading-4 h-4.5 bg-transparent hover:bg-transparent px-0"
        onClose={onClose}
        showTooltip
      />
    </div>
  );
});
