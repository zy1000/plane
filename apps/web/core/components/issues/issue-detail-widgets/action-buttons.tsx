/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React from "react";
import { observer } from "mobx-react";
import { Paperclip, FlaskConical, FileText } from "lucide-react";
import { PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { LinkIcon, ViewsIcon, RelationPropertyIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
// plane imports
import type { TIssueServiceType, TWorkItemWidgets } from "@plane/types";
// plane web imports
import { WorkItemAdditionalWidgetActionButtons } from "@/plane-web/components/issues/issue-detail-widgets/action-buttons";
// local imports
import { IssueAttachmentActionButton } from "./attachments";
import { IssueLinksActionButton } from "./links";
import { RelationActionButton } from "./relations";
import { SubIssuesActionButton } from "./sub-issues";
import { IssueDetailWidgetButton } from "./widget-button";
import IssueCaseSelectionModal from "./qa-cases/IssueCaseSelectionModal";
import { WorkItemRequirementsActionButton } from "./work-item-requirements";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useUserPermissions } from "@/hooks/store/user";

/** 与分段触发器内边距、高度一致，供 CustomMenu / 原生日 button 复用 */
const WIDGET_GROUP_MENU_CLASS = "relative !w-auto min-w-0 text-left !max-w-none";
const WIDGET_GROUP_TRIGGER_CLASS =
  "inline-flex h-7 w-full min-w-0 min-h-[1.75rem] shrink-0 items-center justify-center gap-1 rounded-none !border-0 !bg-transparent px-2.5 !shadow-none transition-colors hover:bg-layer-2-hover focus:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50";
const WIDGET_GROUP_LAYOUT =
  "inline-flex max-w-full flex-nowrap items-stretch divide-x divide-subtle overflow-hidden rounded-md border border-subtle bg-layer-1 shadow-raised-100";
const WIDGET_GROUP_SEGMENT = "flex min-w-0 shrink-0 items-stretch";

/** 分段内 hover 显示说明（与按钮文案/读屏 title 一致） */
function WidgetGroupTooltip({ content, children }: { content: string; children: React.ReactElement }) {
  return (
    <Tooltip tooltipContent={content} position="top" openDelay={200}>
      <div className="inline-flex h-full w-full min-w-0 max-w-full items-stretch">
        {children}
      </div>
    </Tooltip>
  );
}

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  issueServiceType: TIssueServiceType;
  hideWidgets?: TWorkItemWidgets[];
};

export const IssueDetailWidgetActionButtons = observer(function IssueDetailWidgetActionButtons(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled, issueServiceType, hideWidgets } = props;
  // translation
  const { t } = useTranslation();
  const { fetchIssue } = useIssueDetail(issueServiceType);
  const { allowProjectPermissionKeys } = useUserPermissions();
  const [isCaseModalOpen, setIsCaseModalOpen] = React.useState(false);
  // 关联需求要单独的关联管理权限，与工作项可编辑（disabled）是两道门。显式传 ws/pid：
  // peek 可能从工作区级视图打开，靠路由回退会判错项目
  const canManageRequirements =
    !disabled && allowProjectPermissionKeys([PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY], workspaceSlug, projectId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={WIDGET_GROUP_LAYOUT} role="group" aria-label="工作项快捷操作">
        {!hideWidgets?.includes("sub-work-items") && (
          <div className={WIDGET_GROUP_SEGMENT}>
            <WidgetGroupTooltip content={t("issue.add.sub_issue")}>
              <SubIssuesActionButton
                issueId={issueId}
                className={WIDGET_GROUP_MENU_CLASS}
                customButtonClassName={WIDGET_GROUP_TRIGGER_CLASS}
                customButton={
                  <IssueDetailWidgetButton
                    asContentOnly
                    showMenuChevron
                    title={t("issue.add.sub_issue")}
                    icon={<ViewsIcon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
                    disabled={disabled}
                  />
                }
                disabled={disabled}
                issueServiceType={issueServiceType}
              />
            </WidgetGroupTooltip>
          </div>
        )}
        {!hideWidgets?.includes("relations") && (
          <div className={WIDGET_GROUP_SEGMENT}>
            <WidgetGroupTooltip content={t("issue.add.relation")}>
              <RelationActionButton
                issueId={issueId}
                className={WIDGET_GROUP_MENU_CLASS}
                customButtonClassName={WIDGET_GROUP_TRIGGER_CLASS}
                customButton={
                  <IssueDetailWidgetButton
                    asContentOnly
                    showLabel={false}
                    showMenuChevron
                    title={t("issue.add.relation")}
                    icon={<RelationPropertyIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                    disabled={disabled}
                  />
                }
                disabled={disabled}
                issueServiceType={issueServiceType}
              />
            </WidgetGroupTooltip>
          </div>
        )}
        {!hideWidgets?.includes("links") && (
          <div className={WIDGET_GROUP_SEGMENT}>
            <WidgetGroupTooltip content={t("issue.add.link")}>
              <IssueLinksActionButton
                className={WIDGET_GROUP_TRIGGER_CLASS}
                customButton={
                  <IssueDetailWidgetButton
                    asContentOnly
                    showLabel={false}
                    title={t("issue.add.link")}
                    icon={<LinkIcon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
                    disabled={disabled}
                  />
                }
                disabled={disabled}
                issueServiceType={issueServiceType}
              />
            </WidgetGroupTooltip>
          </div>
        )}
        {!hideWidgets?.includes("requirements") && canManageRequirements && (
          <div className={WIDGET_GROUP_SEGMENT}>
            <WidgetGroupTooltip content={t("project_requirements.container.link_button")}>
              <WorkItemRequirementsActionButton
                className={WIDGET_GROUP_TRIGGER_CLASS}
                customButton={
                  <IssueDetailWidgetButton
                    asContentOnly
                    showLabel={false}
                    title={t("project_requirements.container.link_button")}
                    icon={<FileText className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
                    disabled={disabled}
                  />
                }
                disabled={disabled}
                issueServiceType={issueServiceType}
              />
            </WidgetGroupTooltip>
          </div>
        )}
        <div className={WIDGET_GROUP_SEGMENT}>
          <WidgetGroupTooltip content="添加用例">
            <IssueDetailWidgetButton
              title="添加用例"
              showLabel={false}
              variant="ghost"
              className="!h-7 min-w-7 !justify-center !rounded-none !border-0 !px-2 !shadow-none"
              icon={<FlaskConical className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
              disabled={disabled}
              onClick={() => setIsCaseModalOpen(true)}
            />
          </WidgetGroupTooltip>
        </div>
        {!hideWidgets?.includes("attachments") && (
          <div className={WIDGET_GROUP_SEGMENT}>
            <WidgetGroupTooltip content={t("common.attach")}>
              <IssueAttachmentActionButton
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                className={WIDGET_GROUP_TRIGGER_CLASS}
                customButton={
                  <IssueDetailWidgetButton
                    asContentOnly
                    showLabel={false}
                    title={t("common.attach")}
                    icon={<Paperclip className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
                    disabled={disabled}
                  />
                }
                disabled={disabled}
                issueServiceType={issueServiceType}
              />
            </WidgetGroupTooltip>
          </div>
        )}
      </div>
      <WorkItemAdditionalWidgetActionButtons
        disabled={disabled}
        hideWidgets={hideWidgets ?? []}
        issueServiceType={issueServiceType}
        projectId={projectId}
        workItemId={issueId}
        workspaceSlug={workspaceSlug}
      />
      {isCaseModalOpen && (
        <IssueCaseSelectionModal
          open={isCaseModalOpen}
          workspaceSlug={workspaceSlug}
          issueId={issueId}
          onClose={async () => {
            setIsCaseModalOpen(false);
            await fetchIssue(workspaceSlug, projectId, issueId);
          }}
          onConfirmed={async () => {
            await fetchIssue(workspaceSlug, projectId, issueId);
          }}
        />
      )}
    </div>
  );
});
