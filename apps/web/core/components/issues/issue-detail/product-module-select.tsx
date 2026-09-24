import { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { ProductModuleDropdown } from "@/components/dropdowns/product-module/dropdown";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import type { TIssueOperations } from "./root";

type TIssueProductModuleSelect = {
  className?: string;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

/** 产品模块跟着工作项当前的产品走；产品为空时下拉禁用。 */
export const IssueProductModuleSelect = observer(function IssueProductModuleSelect(props: TIssueProductModuleSelect) {
  const { className = "", workspaceSlug, projectId, issueId, issueOperations, disabled = false } = props;
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issue = getIssueById(issueId);
  const disableSelect = disabled || isUpdating;

  const handleChange = async (moduleId: string | null) => {
    if (!issue || moduleId === (issue.product_module_id ?? null)) return;
    setIsUpdating(true);
    try {
      await issueOperations.update(workspaceSlug, projectId, issueId, { product_module_id: moduleId });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={cn("flex h-full items-center gap-1", className)}>
      <ProductModuleDropdown
        projectId={projectId}
        productId={issue?.product_id ?? null}
        value={issue?.product_module_id ?? null}
        valueName={issue?.product_module_name ?? null}
        onChange={handleChange}
        placeholder={t("product_module_field.no_module")}
        disabled={disableSelect}
        className="group w-full"
        buttonContainerClassName="w-full text-left h-7.5 rounded-sm"
        buttonClassName={`text-body-xs-medium justify-between ${issue?.product_module_id ? "" : "text-placeholder"}`}
        buttonVariant="transparent-with-text"
        hideIcon
        dropdownArrow
        dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
      />
    </div>
  );
});
