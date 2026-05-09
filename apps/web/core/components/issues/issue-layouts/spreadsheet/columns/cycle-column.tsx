/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// types
import type { TIssue } from "@plane/types";
// components
import { CycleDropdown } from "@/components/dropdowns/cycle";
// hooks
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import { extractIssueUpdateErrorMessage, type TIssueWorkflowUpdateError } from "../../../workflow-error-utils";

type Props = {
  issue: TIssue;
  onClose: () => void;
  disabled: boolean;
};

export const SpreadsheetCycleColumn = observer(function SpreadsheetCycleColumn(props: Props) {
  const { issue, disabled, onClose } = props;
  const { t } = useTranslation();
  // router
  const { workspaceSlug } = useParams();
  // hooks
  const {
    issues: { addCycleToIssue, removeCycleFromIssue },
  } = useIssuesStore();

  const handleCycle = useCallback(
    async (cycleId: string | null) => {
      if (!workspaceSlug || !issue || !issue.project_id || issue.cycle_id === cycleId) return;
      try {
        if (cycleId) await addCycleToIssue(workspaceSlug.toString(), issue.project_id, cycleId, issue.id);
        else await removeCycleFromIssue(workspaceSlug.toString(), issue.project_id, issue.id);
      } catch (error) {
        if (isProjectPermissionError(error)) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
            message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
              ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
              : undefined,
          });
        } else {
          const errorMessage = extractIssueUpdateErrorMessage(error as TIssueWorkflowUpdateError);
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("common.error.label"),
            message: errorMessage ?? t("entity.update.failed", { entity: t("issue.label") }),
          });
        }
      }
    },
    [workspaceSlug, issue, addCycleToIssue, removeCycleFromIssue, t]
  );

  return (
    <div className="h-11 border-b-[0.5px] border-subtle">
      <CycleDropdown
        projectId={issue.project_id ?? undefined}
        value={issue.cycle_id}
        onChange={handleCycle}
        disabled={disabled}
        placeholder="Select cycle"
        buttonVariant="transparent-with-text"
        buttonContainerClassName="w-full relative flex items-center p-2 group-[.selected-issue-row]:bg-accent-primary/5 group-[.selected-issue-row]:hover:bg-accent-primary/10 px-page-x"
        buttonClassName="relative leading-4 h-4.5 bg-transparent hover:bg-transparent px-0"
        onClose={onClose}
      />
    </div>
  );
});
