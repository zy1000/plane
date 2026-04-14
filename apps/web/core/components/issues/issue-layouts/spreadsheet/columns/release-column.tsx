/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useContext } from "react";
import { xor } from "lodash-es";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// types
import type { TIssue } from "@plane/types";
// components
import { ReleaseDropdown } from "@/components/dropdowns/release/dropdown";
import { StoreContext } from "@/lib/store-context";
import { ReleaseService } from "@/services/release.service";

type Props = {
  issue: TIssue;
  onClose: () => void;
  disabled: boolean;
};

const releaseService = new ReleaseService();

export const SpreadsheetReleaseColumn = observer(function SpreadsheetReleaseColumn(props: Props) {
  const { issue, disabled, onClose } = props;
  const { t } = useTranslation();
  const storeContext = useContext(StoreContext);
  const { workspaceSlug } = useParams();

  const handleRelease = useCallback(
    async (toggledReleaseIds: string[] | null) => {
      if (!workspaceSlug || !issue?.project_id || !issue.id || !toggledReleaseIds) return;

      const currentReleaseIds = issue.release_ids ?? [];
      const updatedReleaseIds = xor(currentReleaseIds, toggledReleaseIds);
      const releasesToAdd: string[] = [];
      const releasesToRemove: string[] = [];
      for (const releaseId of updatedReleaseIds) {
        if (currentReleaseIds.includes(releaseId)) releasesToRemove.push(releaseId);
        else releasesToAdd.push(releaseId);
      }

      const newReleaseIds = currentReleaseIds.filter((id) => !releasesToRemove.includes(id)).concat(releasesToAdd);
      storeContext?.issue.issues.updateIssue(issue.id, { release_ids: newReleaseIds });

      try {
        await releaseService.addReleasesToIssue(workspaceSlug.toString(), issue.project_id, issue.id, {
          releases: releasesToAdd,
          removed_releases: releasesToRemove,
        });
      } catch (error) {
        storeContext?.issue.issues.updateIssue(issue.id, { release_ids: currentReleaseIds });
        if (isProjectPermissionError(error)) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
            message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
              ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
              : undefined,
          });
        } else {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("common.error.label"),
            message: t("entity.update.failed", { entity: t("issue.label") }),
          });
        }
      }
    },
    [workspaceSlug, issue, storeContext, t]
  );

  return (
    <div className="h-11 border-b-[0.5px] border-subtle">
      <ReleaseDropdown
        projectId={issue.project_id ?? undefined}
        value={issue.release_ids ?? []}
        onChange={handleRelease}
        disabled={disabled}
        placeholder={t("release.no_release")}
        buttonVariant="transparent-with-text"
        buttonContainerClassName="w-full relative flex items-center p-2 group-[.selected-issue-row]:bg-accent-primary/5 group-[.selected-issue-row]:hover:bg-accent-primary/10 px-page-x"
        buttonClassName="relative leading-4 h-4.5 bg-transparent hover:bg-transparent !px-0"
        onClose={onClose}
        multiple
        showCount
        showTooltip
      />
    </div>
  );
});
