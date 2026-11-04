import { useState } from "react";
import { observer } from "mobx-react";
import { cn } from "@plane/utils";
import { TestPlanDropdown } from "@/components/dropdowns/test-plan/dropdown";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import type { TIssueOperations } from "./root";

type TIssueTestPlanSelect = {
  className?: string;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

/** 缺陷来源的测试计划：工作项上的普通单值字段，直接走 PATCH，照 stage-select。 */
export const IssueTestPlanSelect = observer(function IssueTestPlanSelect(props: TIssueTestPlanSelect) {
  const { className = "", workspaceSlug, projectId, issueId, issueOperations, disabled = false } = props;
  const [isUpdating, setIsUpdating] = useState(false);
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issue = getIssueById(issueId);
  const disableSelect = disabled || isUpdating;

  const handleChange = async (testPlanId: string | null) => {
    if (!issue || testPlanId === (issue.test_plan_id ?? null)) return;
    setIsUpdating(true);
    try {
      await issueOperations.update(workspaceSlug, projectId, issueId, { test_plan_id: testPlanId });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={cn("flex h-full items-center gap-1", className)}>
      <TestPlanDropdown
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        value={issue?.test_plan_id ?? null}
        onChange={handleChange}
        placeholder="无测试计划"
        disabled={disableSelect}
        className="group w-full"
        buttonContainerClassName="w-full text-left h-7.5 rounded-sm"
        buttonClassName={`text-body-xs-medium justify-between ${issue?.test_plan_id ? "" : "text-placeholder"}`}
        buttonVariant="transparent-with-text"
        hideIcon
        dropdownArrow
        dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
      />
    </div>
  );
});
