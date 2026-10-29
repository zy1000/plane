import { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { ProjectStageDropdown } from "@/components/dropdowns/project-stage/dropdown";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import type { TIssueOperations } from "./root";

type TIssueStageSelect = {
  className?: string;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

/** 阶段是工作项上的普通单值字段，直接走 PATCH，照 product-select。 */
export const IssueStageSelect = observer(function IssueStageSelect(props: TIssueStageSelect) {
  const { className = "", workspaceSlug, projectId, issueId, issueOperations, disabled = false } = props;
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issue = getIssueById(issueId);
  const disableSelect = disabled || isUpdating;

  const handleChange = async (stageId: string | null) => {
    if (!issue || stageId === (issue.stage_id ?? null)) return;
    setIsUpdating(true);
    try {
      await issueOperations.update(workspaceSlug, projectId, issueId, { stage_id: stageId });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={cn("flex h-full items-center gap-1", className)}>
      <ProjectStageDropdown
        projectId={projectId}
        value={issue?.stage_id ?? null}
        valueName={issue?.stage_name ?? null}
        onChange={handleChange}
        placeholder={t("stage_field.no_stage")}
        disabled={disableSelect}
        className="group w-full"
        buttonContainerClassName="w-full text-left h-7.5 rounded-sm"
        buttonClassName={`text-body-xs-medium justify-between ${issue?.stage_id ? "" : "text-placeholder"}`}
        buttonVariant="transparent-with-text"
        hideIcon
        dropdownArrow
        dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
      />
    </div>
  );
});
