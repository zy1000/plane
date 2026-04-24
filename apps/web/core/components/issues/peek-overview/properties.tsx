/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { CalendarClock, CalendarPlus, ChevronDown, Rocket, Type, UserRound } from "lucide-react";
// i18n
import { useTranslation } from "@plane/i18n";
// ui icons
import { CycleIcon, ModuleIcon, LabelPropertyIcon } from "@plane/propel/icons";
import { cn, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// helpers
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
import { WorkItemTypeIcon } from "@/components/issues/work-item-type-icon";

interface IPeekOverviewProperties {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueOperations: TIssueOperations;
}

/** 分组折叠标题：二级标题加粗 + 可折叠箭头，风格对齐设计稿（属性 > 详情 / 项目结构 …） */
function PropertyGroupSection(props: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const { title, defaultOpen = true, children } = props;
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 text-body-sm-semibold text-primary outline-none hover:text-primary focus-visible:outline-none"
      >
        <span>{title}</span>
        <ChevronDown
          className={cn("h-3 w-3 text-tertiary transition-transform duration-200", open ? "rotate-0" : "-rotate-90")}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {open && <div className="mt-2 w-full space-y-3">{children}</div>}
    </section>
  );
}

export const PeekOverviewProperties = observer(function PeekOverviewProperties(props: IPeekOverviewProperties) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled } = props;
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
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
        {/* 详情：类型、工时、标签 */}
        <PropertyGroupSection title="详情">
          {issue?.type_name && (
            <SidebarPropertyListItem icon={Type} label="类型">
              <div className="flex min-w-0 w-full flex-nowrap items-center gap-2">
                <WorkItemTypeIcon typeName={issue.type_name} className="flex-shrink-0" />
                <span className="text-body-xs-medium">{issue.type_name}</span>
              </div>
            </SidebarPropertyListItem>
          )}

          <IssueWorklogProperty
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            disabled={disabled}
          />

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
          {projectDetails?.module_view && (
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

          {projectDetails?.cycle_view && (
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

          <SidebarPropertyListItem icon={Rocket} label="发布">
            <IssueReleaseSelect
              className="w-full grow"
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              issueOperations={issueOperations}
              disabled={disabled}
            />
          </SidebarPropertyListItem>
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
