import { useContext, useState } from "react";
import { xor } from "lodash-es";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { ReleaseDropdown } from "@/components/dropdowns/release/dropdown";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { StoreContext } from "@/lib/store-context";
import { changeIssueReleases } from "./release-operations";
import type { TIssueOperations } from "./root";

type TIssueReleaseSelect = {
  className?: string;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

export const IssueReleaseSelect = observer(function IssueReleaseSelect(props: TIssueReleaseSelect) {
  const { className = "", workspaceSlug, projectId, issueId, issueOperations, disabled = false } = props;
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

    try {
      // 优先走 issueOperations：详情页编辑态下会先暂存，保存时才提交
      if (issueOperations.changeReleasesInIssue) {
        await issueOperations.changeReleasesInIssue(workspaceSlug, projectId, issueId, releasesToAdd, releasesToRemove);
      } else {
        await changeIssueReleases(context.issue.issues, workspaceSlug, projectId, issueId, releasesToAdd, releasesToRemove);
      }
    } catch {
      // changeIssueReleases 已回滚本地值
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
