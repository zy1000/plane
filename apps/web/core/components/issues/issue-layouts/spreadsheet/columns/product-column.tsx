import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
// types
import type { TIssue } from "@plane/types";
// components
import { ProductDropdown } from "@/components/dropdowns/product/dropdown";

type Props = {
  issue: TIssue;
  onClose: () => void;
  onChange: (issue: TIssue, data: Partial<TIssue>, updates: any) => void;
  disabled: boolean;
};

/** 产品是单值字段，走表格的 onChange（普通 PATCH）；换产品同发清空模块。 */
export const SpreadsheetProductColumn = observer(function SpreadsheetProductColumn(props: Props) {
  const { issue, onChange, disabled, onClose } = props;
  const { t } = useTranslation();

  return (
    <div className="h-11 border-b-[0.5px] border-subtle">
      <ProductDropdown
        projectId={issue.project_id ?? undefined}
        value={issue.product_id ?? null}
        valueName={issue.product_name ?? null}
        onChange={(productId) => {
          if ((issue.product_id ?? null) === productId) return;
          onChange(
            issue,
            { product_id: productId, product_module_id: null },
            { changed_property: "product_id", change_details: productId }
          );
        }}
        disabled={disabled}
        placeholder={t("product_field.no_product")}
        buttonVariant="transparent-with-text"
        buttonContainerClassName="w-full relative flex items-center p-2 group-[.selected-issue-row]:bg-accent-primary/5 group-[.selected-issue-row]:hover:bg-accent-primary/10 px-page-x"
        buttonClassName="relative leading-4 h-4.5 bg-transparent hover:bg-transparent px-0"
        onClose={onClose}
        showTooltip
      />
    </div>
  );
});
