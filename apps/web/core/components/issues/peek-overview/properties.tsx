/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { type ComponentType, type ReactNode, useState } from "react";
import { observer } from "mobx-react";
import { CalendarClock, CalendarPlus, FileText, Rocket, UserRound } from "lucide-react";
// i18n
import { useTranslation } from "@plane/i18n";
// ui icons
import { CycleIcon, EstimatePropertyIcon, ModuleIcon, LabelPropertyIcon } from "@plane/propel/icons";
import { cn, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { EstimateDropdown } from "@/components/dropdowns/estimate";
import { RequirementChip } from "@/components/requirements/requirement-chip";
// helpers
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueRequirementLink } from "@/hooks/store/use-issue-requirement-link";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";

// plane web components
import { TransferHopInfo } from "@/plane-web/components/issues/issue-details/sidebar/transfer-hop-info";
import { IssueWorklogProperty } from "@/plane-web/components/issues/worklog/property";
import type { TIssueOperations } from "../issue-detail";
import { IssueCycleSelect } from "../issue-detail/cycle-select";
import { IssueExtraFieldsSection } from "../issue-detail/extra-fields-section";
import { IssueLabel } from "../issue-detail/label";
import { IssueModuleSelect } from "../issue-detail/module-select";
import { IssueReleaseSelect } from "../issue-detail/release-select";

interface IPeekOverviewProperties {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueOperations: TIssueOperations;
}

/** 分组折叠标题：二级标题加粗 + 可折叠箭头，风格对齐设计稿（属性 > 详情 / 项目结构 …） */
export function PropertyGroupSection(props: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const { title, defaultOpen = true, children } = props;
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 text-body-sm-semibold text-primary outline-none hover:text-primary focus-visible:outline-none"
      >
        <span>{title}</span>
        <span
          className={cn(
            "h-0 w-0 border-t-[5px] border-r-[4px] border-l-[4px] border-t-black border-r-transparent border-l-transparent transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90"
          )}
          aria-hidden
        />
      </button>
      {open && <div className="mt-2 w-full space-y-2">{children}</div>}
    </section>
  );
}

// 「结构」三行共用 grid：否则迭代行含 TransferHopInfo 会单独撑宽该行标签列，三行控件左缘无法对齐。
function StructureFieldLabel(props: {
  icon: ComponentType<{ className?: string }>;
  label: ReactNode;
  append?: ReactNode;
}) {
  const { icon: Icon, label, append } = props;

  return (
    <div className="flex h-7.5 shrink-0 items-center gap-1.5 text-body-xs-regular text-tertiary">
      <Icon className="size-4 shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
      {append != null ? <span className="inline-flex shrink-0">{append}</span> : null}
    </div>
  );
}

function StructureFieldValue(props: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-1">{props.children}</div>;
}

export const PeekOverviewProperties = observer(function PeekOverviewProperties(props: IPeekOverviewProperties) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled } = props;
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
  const { areEstimateEnabledByProjectId } = useProjectEstimates();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getUserDetails } = useMember();
  // 工作项侧反查所挂需求：无关联时「需求」行整行不渲染
  const { link: requirementLink } = useIssueRequirementLink(workspaceSlug, projectId, issueId);
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

            {/* 来源需求：只读芯片，改关联回需求侧的「关联工作项」section 操作 */}
            {requirementLink && (
              <>
                <StructureFieldLabel icon={FileText} label={t("project_requirements.issues.source_requirement")} />
                <StructureFieldValue>
                  <RequirementChip
                    displayId={requirementLink.requirement_display_id}
                    name={requirementLink.requirement_name}
                    href={`/${workspaceSlug}/products/${requirementLink.product_id}/requirements/${requirementLink.requirement_id}`}
                  />
                </StructureFieldValue>
              </>
            )}
          </div>
        </PropertyGroupSection>

        <IssueExtraFieldsSection
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          issueOperations={issueOperations}
          disabled={disabled}
        />

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
