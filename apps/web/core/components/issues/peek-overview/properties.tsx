/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Boxes, CalendarClock, CalendarPlus, Package, Rocket, UserRound } from "lucide-react";
// i18n
import { useTranslation } from "@plane/i18n";
// ui icons
import { CycleIcon, EstimatePropertyIcon, ModuleIcon, LabelPropertyIcon } from "@plane/propel/icons";
import { cn, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { EstimateDropdown } from "@/components/dropdowns/estimate";
// helpers
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";

// plane web components
import { TransferHopInfo } from "@/plane-web/components/issues/issue-details/sidebar/transfer-hop-info";
import { IssueWorklogProperty } from "@/plane-web/components/issues/worklog/property";
import type { TIssueOperations } from "../issue-detail";
import { IssueCycleSelect } from "../issue-detail/cycle-select";
import { IssueLabel } from "../issue-detail/label";
import { IssueModuleSelect } from "../issue-detail/module-select";
import { IssueReleaseSelect } from "../issue-detail/release-select";
import { IssueProductSelect } from "../issue-detail/product-select";
import { IssueProductModuleSelect } from "../issue-detail/product-module-select";
import { PeekOverviewBasicProperties } from "./basic-properties";
import { PropertyGroupSection, StructureFieldLabel, StructureFieldValue } from "./property-field";

interface IPeekOverviewProperties {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueOperations: TIssueOperations;
  /** 「基本」组（状态/优先级/负责人/日期）：标题下属性条可见时隐藏，避免一页出现两份。false = 不渲染，字符串 = 外层 class（响应式显隐） */
  basicGroup?: boolean | string;
}

export const PeekOverviewProperties = observer(function PeekOverviewProperties(props: IPeekOverviewProperties) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled, basicGroup = true } = props;
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
  const { areEstimateEnabledByProjectId } = useProjectEstimates();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getUserDetails } = useMember();
  // derived values
  const issue = getIssueById(issueId);
  if (!issue) return <></>;
  const projectDetails = getProjectById(issue.project_id);
  const createdByDetails = getUserDetails(issue?.created_by);
  const formatDateTime = (date: string | Date | undefined | null) => {
    if (!date) return null;
    const day = renderFormattedDate(date);
    if (!day) return null;
    const time = renderFormattedTime(date, "12-hour");
    return time ? `${day} ${time}` : day;
  };
  const createdByLabel = createdByDetails?.display_name?.includes("-intake")
    ? "Plane"
    : (createdByDetails?.display_name ?? "-");
  const createdAtLabel = formatDateTime(issue.created_at);
  const updatedAtLabel = formatDateTime(issue.updated_at);

  return (
    <div>
      <h6 className="text-body-sm-semibold text-primary">{t("common.properties")}</h6>
      <div className={cn("mt-3 flex w-full flex-col gap-5", disabled && "opacity-60")}>
        {basicGroup !== false && (
          <PeekOverviewBasicProperties
            className={typeof basicGroup === "string" ? basicGroup : undefined}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            issueOperations={issueOperations}
            disabled={disabled}
          />
        )}

        {/* 详情：工时、标签 */}
        <PropertyGroupSection title="详情">
          <IssueWorklogProperty
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            disabled={disabled}
          />

          {areEstimateEnabledByProjectId(projectId) && (
            <div className="flex w-full items-center gap-2">
              <div className="flex h-7.5 w-30 shrink-0 items-center gap-1.5 text-body-xs-regular text-tertiary">
                <EstimatePropertyIcon className="size-4 shrink-0" />
                <span>{t("common.estimate")}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                <EstimateDropdown
                  value={issue?.estimate_point ?? undefined}
                  onChange={(val: string | undefined) =>
                    issueOperations.update(workspaceSlug, projectId, issueId, { estimate_point: val })
                  }
                  projectId={projectId}
                  disabled={disabled}
                  buttonVariant="transparent-with-text"
                  className="group w-full"
                  buttonContainerClassName="w-full text-left h-7.5 rounded-sm"
                  buttonClassName={`text-body-xs-medium justify-between ${issue?.estimate_point ? "" : "text-placeholder"}`}
                  placeholder={t("common.none")}
                  hideIcon
                  dropdownArrow
                  dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
                />
              </div>
            </div>
          )}

          <div className="flex w-full items-start gap-2">
            <div className="flex h-7.5 w-30 shrink-0 items-center gap-1.5 text-body-xs-regular text-tertiary">
              <LabelPropertyIcon className="size-4 shrink-0" />
              <span>{t("common.labels")}</span>
            </div>
            <div className="flex grow flex-wrap items-center gap-1 truncate">
              <IssueLabel workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} disabled={disabled} />
            </div>
          </div>
        </PropertyGroupSection>

        {/* 项目结构：模块、迭代、发布 */}
        <PropertyGroupSection title="结构">
          <div className="grid w-full grid-cols-[minmax(7.5rem,max-content)_minmax(0,1fr)] gap-x-2 gap-y-2">
            {projectDetails?.module_view && (
              <>
                <StructureFieldLabel icon={ModuleIcon} label={t("common.modules")} />
                <StructureFieldValue>
                  <IssueModuleSelect
                    className="h-7.5 w-full grow"
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    issueId={issueId}
                    issueOperations={issueOperations}
                    disabled={disabled}
                  />
                </StructureFieldValue>
              </>
            )}

            {projectDetails?.cycle_view && (
              <>
                <StructureFieldLabel
                  icon={CycleIcon}
                  label={t("common.cycle")}
                  append={<TransferHopInfo workItem={issue} />}
                />
                <StructureFieldValue>
                  <IssueCycleSelect
                    className="h-7.5 w-full grow"
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    issueId={issueId}
                    issueOperations={issueOperations}
                    disabled={disabled}
                  />
                </StructureFieldValue>
              </>
            )}

            <StructureFieldLabel icon={Rocket} label="发布" />
            <StructureFieldValue>
              <IssueReleaseSelect
                className="h-7.5 w-full grow"
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                issueOperations={issueOperations}
                disabled={disabled}
              />
            </StructureFieldValue>

            <StructureFieldLabel icon={Package} label={t("product_field.label")} />
            <StructureFieldValue>
              <IssueProductSelect
                className="h-7.5 w-full grow"
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                issueOperations={issueOperations}
                disabled={disabled}
              />
            </StructureFieldValue>

            <StructureFieldLabel icon={Boxes} label={t("product_module_field.label")} />
            <StructureFieldValue>
              <IssueProductModuleSelect
                className="h-7.5 w-full grow"
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                issueOperations={issueOperations}
                disabled={disabled}
              />
            </StructureFieldValue>

          </div>
        </PropertyGroupSection>

        {/* 元信息：单列 grid，标签列用 max-content 与最宽「创建于/更新于」对齐，无多余空白 */}
        <div className="mt-1 grid grid-cols-[auto_max-content_1fr] items-center gap-x-1.5 gap-y-1.5 text-caption-sm-regular text-placeholder">
          <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="shrink-0">创建者</span>
          <span className="min-w-0 truncate">{createdByLabel}</span>
          {createdAtLabel ? (
            <CalendarPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : null}
          {createdAtLabel ? <span className="shrink-0">创建于</span> : null}
          {createdAtLabel ? (
            <span className="min-w-0 truncate tabular-nums">{createdAtLabel}</span>
          ) : null}
          {updatedAtLabel ? (
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : null}
          {updatedAtLabel ? <span className="shrink-0">更新于</span> : null}
          {updatedAtLabel ? (
            <span className="min-w-0 truncate tabular-nums">{updatedAtLabel}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
});
