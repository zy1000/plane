import { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { ProductDropdown } from "@/components/dropdowns/product/dropdown";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import type { TIssueOperations } from "./root";

type TIssueProductSelect = {
  className?: string;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

/** 产品是工作项上的普通单值字段，直接走 PATCH；换产品时一次同发把模块清空（服务端也会兜底）。 */
export const IssueProductSelect = observer(function IssueProductSelect(props: TIssueProductSelect) {
  const { className = "", workspaceSlug, projectId, issueId, issueOperations, disabled = false } = props;
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issue = getIssueById(issueId);
  const disableSelect = disabled || isUpdating;

  const handleChange = async (productId: string | null) => {
    if (!issue || productId === (issue.product_id ?? null)) return;
    setIsUpdating(true);
    try {
      await issueOperations.update(workspaceSlug, projectId, issueId, {
        product_id: productId,
        product_module_id: null,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={cn("flex h-full items-center gap-1", className)}>
      <ProductDropdown
        projectId={projectId}
        value={issue?.product_id ?? null}
        valueName={issue?.product_name ?? null}
        onChange={handleChange}
        placeholder={t("product_field.no_product")}
        disabled={disableSelect}
        className="group w-full"
        buttonContainerClassName="w-full text-left h-7.5 rounded-sm"
        buttonClassName={`text-body-xs-medium justify-between ${issue?.product_id ? "" : "text-placeholder"}`}
        buttonVariant="transparent-with-text"
        hideIcon
        dropdownArrow
        dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
      />
    </div>
  );
});
