import { useState } from "react";
import { observer } from "mobx-react";
import { PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import { RequirementDropdown } from "@/components/dropdowns/requirement";
import { useIssueRequirementLink } from "@/hooks/store/use-issue-requirement-link";
import { useUserPermissions } from "@/hooks/store/user";

type TIssueRequirementSelect = {
  className?: string;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
};

export const IssueRequirementSelect = observer(function IssueRequirementSelect(props: TIssueRequirementSelect) {
  const { className = "", workspaceSlug, projectId, issueId, disabled = false } = props;
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const { allowProjectPermissionKeys } = useUserPermissions();
  const { link, setRequirement } = useIssueRequirementLink(workspaceSlug, projectId, issueId);
  const canManage = allowProjectPermissionKeys(
    [PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY],
    workspaceSlug,
    projectId
  );
  const disableSelect = disabled || isUpdating || !canManage;
  const selectedLabel = link
    ? [link.requirement_display_id, link.requirement_name].filter(Boolean).join(" ")
    : null;

  const handleRequirementChange = async (requirementId: string | null) => {
    if ((link?.requirement_id ?? null) === requirementId) return;
    setIsUpdating(true);
    try {
      await setRequirement(requirementId);
    } catch (error) {
      const payload = error as
        | { code?: string; error?: string; conflicts?: { requirement_display_id?: string }[] }
        | null;
      if (payload?.code === "ISSUE_ALREADY_LINKED" && payload.conflicts?.length) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: t("project_requirements.issues.already_linked", {
            display_id: payload.conflicts[0].requirement_display_id ?? "",
          }),
        });
      } else {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: payload?.error ?? t("project_requirements.issues.toast_link_failed"),
        });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={cn("flex h-full items-center gap-1", className)}>
      <RequirementDropdown
        value={link?.requirement_id ?? null}
        selectedLabel={selectedLabel}
        onChange={handleRequirementChange}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        disabled={disableSelect}
        buttonVariant="transparent-with-text"
        className="group w-full"
        buttonContainerClassName="w-full text-left h-7.5 rounded-sm"
        buttonClassName={`text-body-xs-medium justify-between ${link?.requirement_id ? "" : "text-placeholder"}`}
        placeholder={t("project_requirements.issues.no_requirement")}
        hideIcon
        dropdownArrow
        dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
        itemClassName="px-2"
      />
    </div>
  );
});
