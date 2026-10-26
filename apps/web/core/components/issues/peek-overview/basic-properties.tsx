/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// i18n
import { useTranslation } from "@plane/i18n";
// icons
import {
  DueDatePropertyIcon,
  MembersPropertyIcon,
  PriorityPropertyIcon,
  StartDatePropertyIcon,
  StatePropertyIcon,
  WorkItemsIcon,
} from "@plane/propel/icons";
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
// local
import type { TIssueOperations } from "../issue-detail";
import { StateTransitionAssigneeModal } from "../state-transition-assignee-modal";
import { PropertyGroupSection, StructureFieldLabel, StructureFieldValue } from "./property-field";

type TPeekOverviewBasicProperties = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled: boolean;
  className?: string;
};

const BUTTON_CONTAINER = "w-full text-left h-7.5 rounded-sm";
const ARROW = "h-3.5 w-3.5 hidden group-hover:inline";

/**
 * 右栏「基本」组：类型（只读）、状态、优先级、负责人、开始/结束日期。
 * 两栏布局时替代标题下的 PeekOverviewCorePropertyBar；改状态同样走执行人确认弹窗。
 */
export const PeekOverviewBasicProperties = observer(function PeekOverviewBasicProperties(
  props: TPeekOverviewBasicProperties
) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled, className } = props;
  const { t } = useTranslation();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const stateTransitionGuard = useStateTransitionAssigneeGuard(workspaceSlug, projectId);
  const { issueTypes } = useProjectIssueTypes(workspaceSlug, projectId);

  const issue = getIssueById(issueId);
  if (!issue) return null;
  const stateDetails = getStateById(issue.state_id);
  const issueTypeLogoIcon = issue.type_id
    ? (issueTypes?.find((issueType) => issueType.id === issue.type_id)?.logo_props?.icon ??
      (issue.project_id ? projectIssueTypesCache.get(issue.project_id)?.[issue.type_id]?.logo_props?.icon : undefined))
    : undefined;
  const assigneeCount = issue.assignee_ids?.length ?? 0;

  const handleStateChange = async (nextStateId: string) => {
    await stateTransitionGuard.requestStateChange(issue, nextStateId, async (payload) => {
      await issueOperations.update(workspaceSlug, projectId, issueId, payload);
    });
  };

  return (
    <div className={className}>
      <PropertyGroupSection title="基本">
        <div className="grid w-full grid-cols-[minmax(7.5rem,max-content)_minmax(0,1fr)] gap-x-2 gap-y-2">
          {issue.type_name && (
            <>
              <StructureFieldLabel icon={WorkItemsIcon} label="类型" />
              <StructureFieldValue>
                <div className="flex h-7.5 min-w-0 items-center gap-1.5 px-2 text-body-xs-medium text-secondary">
                  <WorkItemTypeIcon
                    typeName={issue.type_name}
                    fallbackIcon={issueTypeLogoIcon}
                    className="size-3.5 flex-shrink-0"
                  />
                  <span className="min-w-0 truncate">{issue.type_name}</span>
                </div>
              </StructureFieldValue>
            </>
          )}

          <StructureFieldLabel icon={StatePropertyIcon} label={t("common.state")} />
          <StructureFieldValue>
            <StateDropdown
              value={issue.state_id}
              onChange={handleStateChange}
              projectId={projectId}
              issueTypeId={issue.type_id}
              disabled={disabled}
              buttonVariant="transparent-with-text"
              className="group w-full"
              buttonContainerClassName={BUTTON_CONTAINER}
              buttonClassName="text-body-xs-medium justify-between"
              dropdownArrow
              dropdownArrowClassName={ARROW}
            />
          </StructureFieldValue>

          <StructureFieldLabel icon={PriorityPropertyIcon} label={t("common.priority")} />
          <StructureFieldValue>
            <PriorityDropdown
              value={issue.priority}
              onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { priority: val })}
              disabled={disabled}
              buttonVariant="transparent-with-text"
              className="group w-full"
              buttonContainerClassName={BUTTON_CONTAINER}
              buttonClassName={cn(
                "text-body-xs-medium justify-between [&_svg]:size-3.5",
                (!issue.priority || issue.priority === "none") && "text-placeholder"
              )}
              dropdownArrow
              dropdownArrowClassName={ARROW}
            />
          </StructureFieldValue>

          <StructureFieldLabel icon={MembersPropertyIcon} label={t("common.assignees")} />
          <StructureFieldValue>
            <MemberDropdown
              value={issue.assignee_ids ?? undefined}
              onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { assignee_ids: val })}
              disabled={disabled}
              projectId={projectId}
              placeholder={disabled ? "未设置" : t("issue.add.assignee")}
              multiple
              buttonVariant={assigneeCount > 1 ? "transparent-without-text" : "transparent-with-text"}
              className="group w-full"
              buttonContainerClassName={BUTTON_CONTAINER}
              buttonClassName={cn("text-body-xs-medium justify-between", assigneeCount === 0 && "text-placeholder")}
              hideIcon={assigneeCount === 0}
              dropdownArrow
              dropdownArrowClassName={ARROW}
            />
          </StructureFieldValue>

          <StructureFieldLabel icon={StartDatePropertyIcon} label={t("issue.add.start_date")} />
          <StructureFieldValue>
            <DateDropdown
              value={issue.start_date ?? null}
              onChange={(date) =>
                issueOperations.update(workspaceSlug, projectId, issueId, {
                  start_date: date ? renderFormattedPayloadDate(date) : null,
                })
              }
              maxDate={getDate(issue.target_date)}
              placeholder="未设置"
              buttonVariant="transparent-with-text"
              disabled={disabled}
              className="group w-full"
              buttonContainerClassName={BUTTON_CONTAINER}
              buttonClassName={cn("text-body-xs-medium justify-between", !issue.start_date && "text-placeholder")}
              clearIconClassName="text-tertiary opacity-0 group-hover:opacity-100"
              hideIcon
            />
          </StructureFieldValue>

          <StructureFieldLabel icon={DueDatePropertyIcon} label={t("issue.add.due_date")} />
          <StructureFieldValue>
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
                  placeholder="未设置"
                  buttonVariant="transparent-with-text"
                  disabled={disabled}
                  className="group w-full"
                  buttonContainerClassName={BUTTON_CONTAINER}
                  buttonClassName={cn(
                    "text-body-xs-medium justify-between",
                    shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group)
                      ? "text-red-500"
                      : !issue.target_date && "text-placeholder"
                  )}
                  clearIconClassName="text-tertiary opacity-0 group-hover:opacity-100"
                  hideIcon
                />
              </div>
              {issue.target_date ? (
                <span className="shrink-0">
                  <DateAlert date={issue.target_date} workItem={issue} projectId={projectId} />
                </span>
              ) : null}
            </div>
          </StructureFieldValue>
        </div>
      </PropertyGroupSection>
      <StateTransitionAssigneeModal {...stateTransitionGuard.modalProps} />
    </div>
  );
});
