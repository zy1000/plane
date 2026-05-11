import { useContext, useState } from "react";
import { xor } from "lodash-es";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { ReleaseDropdown } from "@/components/dropdowns/release/dropdown";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { StoreContext } from "@/lib/store-context";
import { ReleaseService } from "@/services/release.service";
import type { TIssueOperations } from "./root";

const releaseService = new ReleaseService();

type TIssueReleaseSelect = {
  className?: string;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

export const IssueReleaseSelect = observer(function IssueReleaseSelect(props: TIssueReleaseSelect) {
  const { className = "", workspaceSlug, projectId, issueId, disabled = false } = props;
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const context = useContext(StoreContext);
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issue = getIssueById(issueId);
  const disableSelect = disabled || isUpdating;

  const handleIssueReleaseChange = async (releaseIds: string[]) => {
    if (!issue) return;
    const currentReleaseIds = issue.release_ids ?? [];

    setIsUpdating(true);
    const updatedReleaseIds = xor(currentReleaseIds, releaseIds);
    const releasesToAdd: string[] = [];
    const releasesToRemove: string[] = [];

    for (const releaseId of updatedReleaseIds) {
      if (currentReleaseIds.includes(releaseId)) {
        releasesToRemove.push(releaseId);
      } else {
        releasesToAdd.push(releaseId);
      }
    }

    const newReleaseIds = currentReleaseIds
      .filter((id) => !releasesToRemove.includes(id))
      .concat(releasesToAdd);

    context?.issue.issues.updateIssue(issueId, { release_ids: newReleaseIds });

    try {
      await releaseService.addReleasesToIssue(workspaceSlug, projectId, issueId, {
        releases: releasesToAdd,
        removed_releases: releasesToRemove,
      });
    } catch {
      context?.issue.issues.updateIssue(issueId, { release_ids: currentReleaseIds });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={cn("flex h-full items-center gap-1", className)}>
      <ReleaseDropdown
        projectId={projectId}
        value={issue?.release_ids ?? []}
        onChange={handleIssueReleaseChange}
        placeholder={t("release.no_release")}
        disabled={disableSelect}
        className="group w-full"
        buttonContainerClassName="w-full text-left h-7.5 rounded-sm"
        buttonClassName={`text-body-xs-medium justify-between ${issue?.release_ids?.length ? "" : "text-placeholder"}`}
        buttonVariant="transparent-with-text"
        hideIcon
        dropdownArrow
        dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
        multiple
        itemClassName="px-2"
      />
    </div>
  );
});
