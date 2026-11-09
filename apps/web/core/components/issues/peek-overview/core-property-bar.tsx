/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// i18n
import { useTranslation } from "@plane/i18n";
// utils
import { cn, getDate, renderFormattedPayloadDate, shouldHighlightIssueDueDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { WorkItemTypeIcon } from "@/components/issues/work-item-type-icon";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useStateTransitionAssigneeGuard } from "@/hooks/store/use-state-transition-assignee-guard";
import { projectIssueTypesCache } from "@/services/project";
// plane web
import { DateAlert } from "@/plane-web/components/issues/issue-details/sidebar/date-alert";
import { StateTransitionAssigneeModal } from "../state-transition-assignee-modal";
import type { TIssueOperations } from "../issue-detail";

type TPeekCorePropertyBar = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled: boolean;
  /** 整条压暗（无权限 / 已归档）。不传时跟随 disabled；只是未进编辑态的只读不该压暗 */
  dimmed?: boolean;
};

/**
 * 标题下的核心属性区：窄屏两列、宽屏三列或六列，统一用于详情页和 Peek。
 */
export const PeekOverviewCorePropertyBar = observer(function PeekOverviewCorePropertyBar(props: TPeekCorePropertyBar) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled, dimmed = disabled } = props;
  const { t } = useTranslation();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const stateTransitionGuard = useStateTransitionAssigneeGuard(workspaceSlug, projectId);
  const { issueTypes } = useProjectIssueTypes(workspaceSlug, projectId);

  const issue = getIssueById(issueId);
  if (!issue) return <></>;
  const stateDetails = getStateById(issue.state_id);
  const issueTypeLogoIcon = issue?.type_id
    ? (issueTypes?.find((issueType) => issueType.id === issue.type_id)?.logo_props?.icon ??
      (issue?.project_id ? projectIssueTypesCache.get(issue.project_id)?.[issue.type_id]?.logo_props?.icon : undefined))
    : undefined;

  const handleStateChange = async (nextStateId: string) => {
    await stateTransitionGuard.requestStateChange(issue, nextStateId, async (payload) => {
      await issueOperations.update(workspaceSlug, projectId, issueId, payload);
    });
  };

  const fieldShell = "flex min-w-0 flex-col gap-2";
  const fieldLabel = "text-12 text-tertiary";

  return (
    <div className="@container border-b border-subtle pb-5">
      <div
        className={cn(
          "grid w-full min-w-0 grid-cols-2 items-start gap-x-5 gap-y-4 text-body-xs-medium @lg:grid-cols-3 @4xl:grid-cols-6",
          dimmed && "opacity-60"
        )}
      >
        <div className={fieldShell}>
          <span className={fieldLabel}>工作项类型</span>
          {issue.type_name ? (
            <div className="flex h-7 w-full min-w-0 items-center gap-1.5 truncate rounded-sm pr-1.5 text-body-xs-medium leading-5 text-secondary">
              <WorkItemTypeIcon
                typeName={issue.type_name}
                fallbackIcon={issueTypeLogoIcon}
                className="size-3.5 flex-shrink-0"
              />
              <span className="min-w-0 truncate">{issue.type_name}</span>
            </div>
          ) : null}
        </div>

        <div className={fieldShell}>
          <span className={fieldLabel}>{t("common.state")}</span>
          <StateDropdown
            value={issue?.state_id}
            onChange={handleStateChange}
            projectId={projectId}
            issueTypeId={issue?.type_id}
            disabled={disabled}
            buttonVariant="transparent-with-text"
            className="group w-full min-w-0"
            buttonContainerClassName="h-7 w-full min-w-0 text-left"
            buttonClassName={cn(
              "w-full min-w-0 truncate pr-1.5 !pl-0 text-body-xs-medium leading-5",
              issue?.state_id ? "text-secondary" : "text-placeholder"
            )}
          />
        </div>

        <div className={fieldShell}>
          <span className={fieldLabel}>{t("common.priority")}</span>
          <PriorityDropdown
            value={issue?.priority}
            onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { priority: val })}
            disabled={disabled}
            buttonVariant="transparent-with-text"
            className="h-7 w-full min-w-0 rounded-sm"
            buttonContainerClassName="h-7 w-full min-w-0 text-left"
            buttonClassName={cn(
              "w-full min-w-0 truncate !px-0 text-body-xs-medium leading-5 [&_svg]:size-3.5",
              !issue?.priority || issue?.priority === "none" ? "text-placeholder" : "text-secondary"
            )}
          />
        </div>

        <div className={fieldShell}>
          <span className={fieldLabel}>{t("common.assignees")}</span>
          <MemberDropdown
            value={issue?.assignee_ids ?? undefined}
            onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { assignee_ids: val })}
            disabled={disabled}
            projectId={projectId}
            placeholder={disabled ? "未设置" : t("issue.add.assignee")}
            multiple
            buttonVariant={
              issue?.assignee_ids && issue.assignee_ids.length > 1
                ? "transparent-without-text"
                : "transparent-with-text"
            }
            className="group w-full min-w-0"
            buttonContainerClassName="h-7 w-full min-w-0 text-left"
            buttonClassName={cn(
              "min-w-0 justify-start truncate !px-0 text-body-xs-medium leading-5",
              (issue?.assignee_ids?.length ?? 0) > 0 ? "text-secondary" : "text-placeholder"
            )}
          />
        </div>

        <div className={fieldShell}>
          <span className={fieldLabel}>{t("issue.add.start_date")}</span>
          <DateDropdown
            value={issue.start_date ?? null}
            onChange={(date) =>
              issueOperations.update(workspaceSlug, projectId, issueId, {
                start_date: date ? renderFormattedPayloadDate(date) : null,
              })
            }
            maxDate={getDate(issue.target_date)}
            placeholder={disabled ? "未设置" : t("issue.add.start_date")}
            buttonVariant="transparent-with-text"
            disabled={disabled}
            className="group w-full min-w-0"
            buttonContainerClassName="h-7 w-full min-w-0 text-left"
            buttonClassName={cn(
              "w-full min-w-0 truncate !px-0 text-body-xs-medium leading-5",
              !issue.start_date ? "text-placeholder" : "text-secondary"
            )}
            clearIconClassName="text-tertiary opacity-0 group-hover:opacity-100"
          />
        </div>

        <div className={fieldShell}>
          <span className={fieldLabel}>{t("issue.add.due_date")}</span>
          <div className="flex w-full min-w-0 items-center gap-1">
            <div className="min-w-0 flex-1">
              <DateDropdown
                value={issue.target_date ?? null}
                onChange={(date) =>
                  issueOperations.update(workspaceSlug, projectId, issueId, {
                    target_date: date ? renderFormattedPayloadDate(date) : null,
                  })
                }
                minDate={getDate(issue.start_date)}
                placeholder={disabled ? "未设置" : t("issue.add.due_date")}
                buttonVariant="transparent-with-text"
                disabled={disabled}
                className="group w-full min-w-0"
                buttonContainerClassName="h-7 w-full min-w-0 text-left"
                buttonClassName={cn(
                  "w-full min-w-0 truncate !px-0 text-body-xs-medium leading-5",
                  shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group)
                    ? "text-red-500"
                    : !issue.target_date
                      ? "text-placeholder"
                      : "text-secondary"
                )}
                clearIconClassName="text-tertiary opacity-0 group-hover:opacity-100"
              />
            </div>
            {issue.target_date ? (
              <span className="shrink-0">
                <DateAlert date={issue.target_date} workItem={issue} projectId={projectId} />
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <StateTransitionAssigneeModal {...stateTransitionGuard.modalProps} />
    </div>
  );
});
