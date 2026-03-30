/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { xor } from "lodash-es";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// types
import type { TIssue } from "@plane/types";
// components
import { ModuleDropdown } from "@/components/dropdowns/module/dropdown";
// hooks
import { useIssuesStore } from "@/hooks/use-issue-layout-store";

type Props = {
  issue: TIssue;
  onClose: () => void;
  disabled: boolean;
};

export const SpreadsheetModuleColumn = observer(function SpreadsheetModuleColumn(props: Props) {
  const { issue, disabled, onClose } = props;
  const { t } = useTranslation();
  // router
  const { workspaceSlug } = useParams();
  // hooks
  const {
    issues: { changeModulesInIssue },
  } = useIssuesStore();

  const handleModule = useCallback(
    async (moduleIds: string[] | null) => {
      if (!workspaceSlug || !issue || !issue.project_id || !issue.module_ids || !moduleIds) return;

      const updatedModuleIds = xor(issue.module_ids, moduleIds);
      const modulesToAdd: string[] = [];
      const modulesToRemove: string[] = [];
      for (const moduleId of updatedModuleIds) {
        if (issue.module_ids.includes(moduleId)) modulesToRemove.push(moduleId);
        else modulesToAdd.push(moduleId);
      }
      try {
        await changeModulesInIssue(workspaceSlug.toString(), issue.project_id, issue.id, modulesToAdd, modulesToRemove);
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
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("common.error.label"),
            message: t("entity.update.failed", { entity: t("issue.label") }),
          });
        }
      }
    },
    [workspaceSlug, issue, changeModulesInIssue, t]
  );

  return (
    <div className="h-11 border-b-[0.5px] border-subtle">
      <ModuleDropdown
        projectId={issue?.project_id ?? undefined}
        value={issue?.module_ids ?? []}
        onChange={handleModule}
        disabled={disabled}
        placeholder="Select modules"
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
