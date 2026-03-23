/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useState } from "react";
import { observer } from "mobx-react";
// i18n
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
// ui icons
import {
  CycleIcon,
  StatePropertyIcon,
  ModuleIcon,
  MembersPropertyIcon,
  PriorityPropertyIcon,
  StartDatePropertyIcon,
  LabelPropertyIcon,
  UserCirclePropertyIcon,
  EstimatePropertyIcon,
  ParentPropertyIcon,
} from "@plane/propel/icons";
import { cn, getDate, renderFormattedPayloadDate, shouldHighlightIssueDueDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { EstimateDropdown } from "@/components/dropdowns/estimate";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// helpers
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
// plane web components
import { WorkItemAdditionalSidebarProperties } from "@/plane-web/components/issues/issue-details/additional-properties";
import { IssueParentSelectRoot } from "@/plane-web/components/issues/issue-details/parent-select-root";
import { DateAlert } from "@/plane-web/components/issues/issue-details/sidebar/date-alert";
import { TransferHopInfo } from "@/plane-web/components/issues/issue-details/sidebar/transfer-hop-info";
import { IssueWorklogProperty } from "@/plane-web/components/issues/worklog/property";
import type { TIssueOperations } from "../issue-detail";
import { IssueCycleSelect } from "../issue-detail/cycle-select";
import { IssueLabel } from "../issue-detail/label";
import { IssueModuleSelect } from "../issue-detail/module-select";
import { projectIssueTypesCache } from "@/services/project";
import * as LucideIcons from "lucide-react";

interface IPeekOverviewProperties {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueOperations: TIssueOperations;
}

export const PeekOverviewProperties = observer(function PeekOverviewProperties(props: IPeekOverviewProperties) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled } = props;
  const { t } = useTranslation();
  const [isMetaExpanded, setIsMetaExpanded] = useState(false);
  // store hooks
  const { getProjectById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const { getUserDetails } = useMember();
  // derived values
  const issue = getIssueById(issueId);
  if (!issue) return <></>;
  const createdByDetails = getUserDetails(issue?.created_by);
  const projectDetails = getProjectById(issue.project_id);
  const isEstimateEnabled = projectDetails?.estimate;
  const stateDetails = getStateById(issue.state_id);

  // // Get project issue types map
  const projectIssueTypesMap = projectIssueTypesCache.get(issue.project_id ?? "");

  return (
    <div>
      <h6 className="text-body-xs-medium">{t("common.properties")}</h6>
      <div className={`mt-3 w-full space-y-3 ${disabled ? "opacity-60" : ""}`}>
        <SidebarPropertyListItem icon={StatePropertyIcon} label={t("common.state")}>
          <StateDropdown
            value={issue?.state_id}
            onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { state_id: val })}
            projectId={projectId}
            issueTypeId={issue?.type_id}
            disabled={disabled}
            buttonVariant="transparent-with-text"
            className="group w-full grow"
            buttonContainerClassName="w-full text-left h-7.5"
            buttonClassName={`text-body-xs-medium ${issue?.state_id ? "" : "text-placeholder"}`}
            dropdownArrow
            dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
          />
        </SidebarPropertyListItem>

        {/* type */}
        {projectIssueTypesMap && issue?.type_id && projectIssueTypesMap[issue.type_id] && (
          <SidebarPropertyListItem icon={LucideIcons.Type} label="类型">
            <div className="flex items-center gap-2">
              {(() => {
                const issueType = projectIssueTypesMap[issue.type_id];
                const { name, color, background_color } = issueType.logo_props?.icon || {};
                const IconComp = name ? ((LucideIcons as any)[name] as React.FC<any> | undefined) : undefined;
                return (
                  <>
                    <span
                      className="inline-flex items-center justify-center rounded-sm flex-shrink-0"
                      style={{
                        backgroundColor: background_color || "transparent",
                        color: color || "currentColor",
                        width: "16px",
                        height: "16px",
                      }}
                      aria-label={`Issue type: ${issueType.name}`}
                    >
                      {IconComp ? (
                        <IconComp className="h-3.5 w-3.5" strokeWidth={2} />
                      ) : (
                        <span className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="text-body-xs-medium">{issueType.name}</span>
                  </>
                );
              })()}
            </div>
          </SidebarPropertyListItem>
        )}

        <SidebarPropertyListItem icon={MembersPropertyIcon} label={t("common.assignees")}>
          <MemberDropdown
            value={issue?.assignee_ids ?? undefined}
            onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { assignee_ids: val })}
            disabled={disabled}
            projectId={projectId}
            placeholder={t("issue.add.assignee")}
            multiple
            buttonVariant={issue?.assignee_ids?.length > 1 ? "transparent-without-text" : "transparent-with-text"}
            className="group w-full grow"
            buttonContainerClassName="w-full text-left h-7.5"
            buttonClassName={`text-body-xs-medium justify-between ${issue?.assignee_ids?.length > 0 ? "" : "text-placeholder"}`}
            hideIcon={issue.assignee_ids?.length === 0}
            dropdownArrow
            dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
          />
        </SidebarPropertyListItem>

        {/* date range */}
        <SidebarPropertyListItem icon={StartDatePropertyIcon} label={t("project_cycles.date_range")}>
          <div className="flex items-center gap-2 w-3/4 flex-grow min-w-0">
            <div className="flex items-center gap-1">
              <div className="h-7 w-28 flex-shrink-0">
                <DateDropdown
                  value={issue.start_date ?? null}
                  onChange={(date) =>
                    issueOperations.update(workspaceSlug, projectId, issueId, {
                      start_date: date ? renderFormattedPayloadDate(date) : null,
                    })
                  }
                  maxDate={getDate(issue.target_date)}
                  placeholder={t("issue.add.start_date")}
                  buttonVariant="transparent-with-text"
                  disabled={disabled}
                  className="group w-full"
                  buttonContainerClassName="w-full text-left"
                  buttonClassName={cn("text-sm justify-between", !issue.start_date ? "text-custom-text-400" : "")}
                  clearIconClassName="hidden group-hover:inline !text-custom-text-100"
                  hideIcon
                />
              </div>
              <span className="text-custom-text-300 flex-shrink-0">→</span>
              <div className="h-7 w-32 flex-shrink-0">
                <DateDropdown
                  value={issue.target_date ?? null}
                  onChange={(date) =>
                    issueOperations.update(workspaceSlug, projectId, issueId, {
                      target_date: date ? renderFormattedPayloadDate(date) : null,
                    })
                  }
                  minDate={getDate(issue.start_date)}
                  placeholder={t("issue.add.due_date")}
                  buttonVariant="transparent-with-text"
                  disabled={disabled}
                  className="group w-full"
                  buttonContainerClassName="w-full text-left"
                  buttonClassName={cn(
                    "text-sm justify-between",
                    shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group)
                      ? "text-red-500"
                      : !issue.target_date
                        ? "text-custom-text-400"
                        : ""
                  )}
                  clearIconClassName="hidden group-hover:inline !text-custom-text-100"
                  hideIcon
                />
              </div>
            </div>
            {issue.target_date && <DateAlert date={issue.target_date} workItem={issue} projectId={projectId} />}
          </div>
        </SidebarPropertyListItem>

        <SidebarPropertyListItem icon={PriorityPropertyIcon} label={t("common.priority")}>
          <PriorityDropdown
            value={issue?.priority}
            onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { priority: val })}
            disabled={disabled}
            buttonVariant="transparent-with-text"
            className="h-7.5 w-full grow rounded-sm"
            buttonContainerClassName="w-full text-left h-7.5"
            buttonClassName={`text-body-xs-medium whitespace-nowrap [&_svg]:size-3.5 ${!issue?.priority || issue?.priority === "none" ? "text-placeholder" : ""}`}
          />
        </SidebarPropertyListItem>

        {/* created by */}
        {createdByDetails && (
          <SidebarPropertyListItem
            icon={UserCirclePropertyIcon}
            label={t("common.created_by")}
            childrenClassName="px-2"
          >
            <ButtonAvatars
              showTooltip
              userIds={createdByDetails?.display_name.includes("-intake") ? null : createdByDetails?.id}
            />
            <span className="grow truncate text-body-xs-medium leading-5 text-secondary">
              {createdByDetails?.display_name.includes("-intake") ? "Plane" : createdByDetails?.display_name}
            </span>
          </SidebarPropertyListItem>
        )}


        {isEstimateEnabled && (
          <SidebarPropertyListItem icon={EstimatePropertyIcon} label={t("common.estimate")}>
            <EstimateDropdown
              value={issue.estimate_point ?? undefined}
              onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { estimate_point: val })}
              projectId={projectId}
              disabled={disabled}
              buttonVariant="transparent-with-text"
              className="group w-full grow"
              buttonContainerClassName="w-full text-left h-7.5"
              buttonClassName={`text-body-xs-medium ${issue?.estimate_point !== undefined ? "" : "text-placeholder"}`}
              placeholder="None"
              hideIcon
              dropdownArrow
              dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
            />
          </SidebarPropertyListItem>
        )}

        {isMetaExpanded && projectDetails?.module_view && (
          <SidebarPropertyListItem icon={ModuleIcon} label={t("common.modules")}>
            <IssueModuleSelect
              className="w-full grow"
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              issueOperations={issueOperations}
              disabled={disabled}
            />
          </SidebarPropertyListItem>
        )}

        {isMetaExpanded && projectDetails?.cycle_view && (
          <SidebarPropertyListItem
            icon={CycleIcon}
            label={t("common.cycle")}
            appendElement={<TransferHopInfo workItem={issue} />}
          >
            <IssueCycleSelect
              className="h-7.5 w-full grow"
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              issueOperations={issueOperations}
              disabled={disabled}
            />
          </SidebarPropertyListItem>
        )}

        {/* parent */}
        {isMetaExpanded && (
          <div className="flex w-full items-center gap-2 h-8">
            <div className="flex h-7.5 w-30 shrink-0 items-center gap-1.5 text-body-xs-regular text-tertiary">
              <ParentPropertyIcon className="size-4 shrink-0" />
              <p>{t("common.parent")}</p>
            </div>
            <IssueParentSelectRoot
              className="grow h-full"
              disabled={disabled}
              issueId={issueId}
              issueOperations={issueOperations}
              projectId={projectId}
              workspaceSlug={workspaceSlug}
            />
          </div>
        )}

        {/* label + toggle */}
        <div className="flex w-full flex-col gap-1">
          {isMetaExpanded && (
            <div className="flex w-full items-start gap-2 min-h-8">
              <div className="flex h-7.5 w-30 shrink-0 items-center gap-1.5 text-body-xs-regular text-tertiary">
                <LabelPropertyIcon className="size-4 shrink-0" />
                <span>{t("common.labels")}</span>
              </div>
              <div className="flex grow flex-wrap items-center gap-1 truncate">
                <IssueLabel workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} disabled={disabled} />
              </div>
            </div>
          )}
          <div className="flex w-full items-center justify-start h-6">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsMetaExpanded((prev) => !prev);
              }}
            >
              {isMetaExpanded ? (
                <LucideIcons.ChevronUp className="size-4" />
              ) : (
                <LucideIcons.ChevronDown className="size-4" />
              )}
              {isMetaExpanded ? <p className="text-[#a3a3a3]">收起更多</p> : <p className="text-[#a3a3a3]">展开更多</p>}
            </Button>
          </div>
        </div>

        <IssueWorklogProperty
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          disabled={disabled}
        />

        <WorkItemAdditionalSidebarProperties
          workItemId={issue.id}
          workItemTypeId={issue.type_id}
          projectId={projectId}
          workspaceSlug={workspaceSlug}
          isEditable={!disabled}
          isPeekView
        />
      </div>
    </div>
  );
});
