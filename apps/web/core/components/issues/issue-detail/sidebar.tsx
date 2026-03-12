/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// i18n
import { useTranslation } from "@plane/i18n";
// ui
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
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
// plane web components
// components
import { WorkItemAdditionalSidebarProperties } from "@/plane-web/components/issues/issue-details/additional-properties";
import { IssueParentSelectRoot } from "@/plane-web/components/issues/issue-details/parent-select-root";
import { DateAlert } from "@/plane-web/components/issues/issue-details/sidebar/date-alert";
import { TransferHopInfo } from "@/plane-web/components/issues/issue-details/sidebar/transfer-hop-info";
import { IssueWorklogProperty } from "@/plane-web/components/issues/worklog/property";
import { IssueCycleSelect } from "./cycle-select";
import { IssueLabel } from "./label";
import { IssueModuleSelect } from "./module-select";
import type { TIssueOperations } from "./root";
import { projectIssueTypesCache } from "@/services/project";
import * as LucideIcons from "lucide-react";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  isEditable: boolean;
};

export const IssueDetailsSidebar = observer(function IssueDetailsSidebar(props: Props) {
  const { t } = useTranslation();
  const { workspaceSlug, projectId, issueId, issueOperations, isEditable } = props;
  // store hooks
  const { getProjectById } = useProject();
  const { areEstimateEnabledByProjectId } = useProjectEstimates();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getUserDetails } = useMember();
  const { getStateById } = useProjectState();
  const issue = getIssueById(issueId);
  if (!issue) return <></>;

  const createdByDetails = getUserDetails(issue.created_by);

  // derived values
  const projectDetails = getProjectById(issue.project_id);
  const stateDetails = getStateById(issue.state_id);

  const projectIssueTypesMap = projectIssueTypesCache.get(issue.project_id ?? "");

  return (
    <>
      <div className="flex h-full w-full flex-col items-center divide-y-2 divide-subtle-1 overflow-hidden">
        <div className="h-full w-full overflow-y-auto px-6">
          <h5 className="mt-6 text-sm font-medium">{t("common.properties")}</h5>
          {/* TODO: render properties using a common component */}
          <div className={`mb-2 mt-3 space-y-2.5 ${!isEditable ? "opacity-60" : ""}`}>
            <div className="flex h-8 items-center gap-1">
              <div className="flex w-1/3 flex-shrink-0 items-center gap-1 text-sm text-secondary">
                <StatePropertyIcon className="h-4 w-4 flex-shrink-0" />
                <span>{t("common.state")}</span>
              </div>
              <StateDropdown
                value={issue?.state_id}
                onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { state_id: val })}
                projectId={projectId?.toString() ?? ""}
                disabled={!isEditable}
                buttonVariant="transparent-with-text"
                className="group w-2/3 flex-grow"
                buttonContainerClassName="w-full text-left"
                buttonClassName="text-sm"
                dropdownArrow
                dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
              />
            </div>

            {/* type */}
            {projectIssueTypesMap && issue?.type_id && projectIssueTypesMap[issue.type_id] && (
              <div className="flex h-8 items-center gap-1">
                <div className="flex w-1/3 flex-shrink-0 items-center gap-1 text-sm text-secondary">
                  <LucideIcons.Type className="h-4 w-4 flex-shrink-0" />
                  <span>类型</span>
                </div>
                <div className="w-2/3 flex-grow flex items-center gap-2 rounded px-2 py-0.5 text-sm">
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
                        <span className="text-secondary">{issueType.name}</span>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="flex h-8 items-center gap-1">
              <div className="flex w-1/3 flex-shrink-0 items-center gap-1 text-sm text-secondary">
                <MembersPropertyIcon className="h-4 w-4 flex-shrink-0" />
                <span>{t("common.assignees")}</span>
              </div>
              <MemberDropdown
                value={issue?.assignee_ids ?? undefined}
                onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { assignee_ids: val })}
                disabled={!isEditable}
                projectId={projectId?.toString() ?? ""}
                placeholder={t("issue.add.assignee")}
                multiple
                buttonVariant={issue?.assignee_ids?.length > 1 ? "transparent-without-text" : "transparent-with-text"}
                className="group w-2/3 flex-grow"
                buttonContainerClassName="w-full text-left"
                buttonClassName={`text-sm justify-between ${
                  issue?.assignee_ids?.length > 0 ? "" : "text-placeholder"
                }`}
                hideIcon={issue.assignee_ids?.length === 0}
                dropdownArrow
                dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
              />
            </div>

            <div className="flex h-8 items-center gap-1">
              <div className="flex w-1/3 flex-shrink-0 items-center gap-1 text-sm text-secondary">
                <StartDatePropertyIcon className="h-4 w-4 flex-shrink-0" />
                <span>{t("project_cycles.date_range")}</span>
              </div>
              <div className="flex items-center gap-1 w-2/3 flex-grow min-w-0">
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
                    disabled={!isEditable}
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
                    disabled={!isEditable}
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
                {issue.target_date && <DateAlert date={issue.target_date} workItem={issue} projectId={projectId} />}
              </div>
            </div>

            <div className="flex h-8 items-center gap-1">
              <div className="flex w-1/3 flex-shrink-0 items-center gap-1 text-sm text-secondary">
                <PriorityPropertyIcon className="h-4 w-4 flex-shrink-0" />
                <span>{t("common.priority")}</span>
              </div>
              <PriorityDropdown
                value={issue?.priority}
                onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { priority: val })}
                disabled={!isEditable}
                buttonVariant="border-with-text"
                className="w-2/3 flex-grow rounded px-2 hover:bg-layer-1-hover"
                buttonContainerClassName="w-full text-left"
                buttonClassName="w-min h-auto whitespace-nowrap"
              />
            </div>

            {createdByDetails && (
              <div className="flex h-8 items-center gap-1">
                <div className="flex w-1/3 flex-shrink-0 items-center gap-1 text-sm text-secondary">
                  <UserCirclePropertyIcon className="h-4 w-4 flex-shrink-0" />
                  <span>{t("common.created_by")}</span>
                </div>
                <div className="w-2/3 h-full flex items-center gap-1.5 rounded px-2 py-0.5 text-sm justify-between cursor-not-allowed">
                  <ButtonAvatars showTooltip userIds={createdByDetails.id} />
                  <span className="grow truncate text-body-xs-regular leading-5">{createdByDetails?.display_name}</span>
                </div>
              </div>
            )}

            {projectId && areEstimateEnabledByProjectId(projectId) && (
              <div className="flex h-8 items-center gap-1">
                <div className="flex w-1/3 flex-shrink-0 items-center gap-1 text-sm text-secondary">
                  <EstimatePropertyIcon className="h-4 w-4 flex-shrink-0" />
                  <span>{t("common.estimate")}</span>
                </div>
                <EstimateDropdown
                  value={issue?.estimate_point ?? undefined}
                  onChange={(val: string | undefined) =>
                    issueOperations.update(workspaceSlug, projectId, issueId, { estimate_point: val })
                  }
                  projectId={projectId}
                  disabled={!isEditable}
                  buttonVariant="transparent-with-text"
                  className="group w-2/3 flex-grow"
                  buttonContainerClassName="w-full text-left"
                  buttonClassName={`text-sm ${issue?.estimate_point !== null ? "" : "text-placeholder"}`}
                  placeholder={t("common.none")}
                  hideIcon
                  dropdownArrow
                  dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
                />
              </div>
            )}

            {projectDetails?.module_view && (
              <div className="flex min-h-8 gap-1">
                <div className="flex w-1/3 flex-shrink-0 gap-1 pt-2 text-sm text-secondary">
                  <ModuleIcon className="h-4 w-4 flex-shrink-0" />
                  <span>{t("common.modules")}</span>
                </div>
                <IssueModuleSelect
                  className="w-2/3 flex-grow"
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  issueId={issueId}
                  issueOperations={issueOperations}
                  disabled={!isEditable}
                />
              </div>
            )}

            {projectDetails?.cycle_view && (
              <div className="flex h-8 items-center gap-1">
                <div className="flex w-1/3 flex-shrink-0 items-center gap-1 text-sm text-secondary">
                  <CycleIcon className="h-4 w-4 flex-shrink-0" />
                  <span>{t("common.cycle")}</span>
                  <TransferHopInfo workItem={issue} />
                </div>
                <IssueCycleSelect
                  className="w-2/3 flex-grow"
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  issueId={issueId}
                  issueOperations={issueOperations}
                  disabled={!isEditable}
                />
              </div>
            )}

            <div className="flex h-8 items-center gap-1">
              <div className="flex w-1/3 flex-shrink-0 items-center gap-1 text-sm text-secondary">
                <ParentPropertyIcon className="h-4 w-4 flex-shrink-0" />
                <span>{t("common.parent")}</span>
              </div>
              <IssueParentSelectRoot
                className="h-full w-2/3 flex-grow"
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                issueOperations={issueOperations}
                disabled={!isEditable}
              />
            </div>

            <div className="flex min-h-8 gap-1">
              <div className="flex w-1/3 flex-shrink-0 gap-1 pt-2 text-sm text-secondary">
                <LabelPropertyIcon className="h-4 w-4 flex-shrink-0" />
                <span>{t("common.labels")}</span>
              </div>
              <div className="h-full min-h-8 w-2/3 flex-grow">
                <IssueLabel
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  issueId={issueId}
                  disabled={!isEditable}
                />
              </div>
            </div>

            <IssueWorklogProperty
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              disabled={!isEditable}
            />

            <WorkItemAdditionalSidebarProperties
              workItemId={issue.id}
              workItemTypeId={issue.type_id}
              projectId={projectId}
              workspaceSlug={workspaceSlug}
              isEditable={isEditable}
            />
          </div>
        </div>
      </div>
    </>
  );
});
