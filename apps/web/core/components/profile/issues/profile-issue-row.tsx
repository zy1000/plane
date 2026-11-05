/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentProps, MouseEvent, ReactNode, SyntheticEvent } from "react";
import { useCallback } from "react";
import { differenceInCalendarDays } from "date-fns/differenceInCalendarDays";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { ChevronRightIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssue, TIssuePriorities } from "@plane/types";
import { cn, getDate, renderFormattedPayloadDate, shouldHighlightIssueDueDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { IssueApprovalTag } from "@/components/issues/issue-approval-tag";
import { StateTransitionAssigneeModal } from "@/components/issues/state-transition-assignee-modal";
import {
  extractIssueUpdateErrorMessage,
  isWorkflowApprovalInitiated,
  type TIssueWorkflowUpdateError,
} from "@/components/issues/workflow-error-utils";
import { WorkItemTypeIcon } from "@/components/issues/work-item-type-icon";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
import {
  useStateTransitionAssigneeGuard,
  type TStateTransitionUpdatePayload,
} from "@/hooks/store/use-state-transition-assignee-guard";
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  issue: TIssue;
  workspaceSlug: string | undefined;
  projectIdentifier: string | undefined;
  typeIcon?: ComponentProps<typeof WorkItemTypeIcon>["fallbackIcon"];
  /** 子工作项缩进（px），顶层为 0 */
  indent: number;
  subIssuesCount: number;
  isExpanded: boolean;
  onToggleExpand: (e: MouseEvent<HTMLButtonElement>) => void;
  isReadOnly: boolean;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: ReactNode;
};

// 行本身是链接（点开详情抽屉），单元格里的下拉不能把点击冒泡上去
const stopPropagation = (e: SyntheticEvent<HTMLDivElement>) => {
  e.stopPropagation();
  e.preventDefault();
};

/** 截止日期跨年才带年份 */
const getDateFormatToken = (date: string | null | undefined) => {
  const parsed = getDate(date);
  return parsed && parsed.getFullYear() !== new Date().getFullYear() ? "yyyy-MM-dd" : "MM-dd";
};

/**
 * 个人主页工作项 / 缺陷列表的一行：与 PROFILE_ISSUE_GRID_CLASS 的列一一对应。
 * 状态 / 优先级 / 截止日期 / 负责人可就地改，处理方式与普通列表一致（状态走流转负责人校验、审批提示）。
 */
export const ProfileIssueRowCells = observer(function ProfileIssueRowCells(props: Props) {
  const {
    issue,
    workspaceSlug,
    projectIdentifier,
    typeIcon,
    indent,
    subIssuesCount,
    isExpanded,
    onToggleExpand,
    isReadOnly,
    updateIssue,
    quickActions,
  } = props;
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();
  const { getStateById } = useProjectState();
  const stateTransitionGuard = useStateTransitionAssigneeGuard(workspaceSlug, issue.project_id ?? undefined);

  const stateGroup = getStateById(issue.state_id)?.group ?? issue.state__group ?? undefined;
  const isOverdue = shouldHighlightIssueDueDate(issue.target_date, stateGroup);
  const overdueDays = isOverdue ? differenceInCalendarDays(new Date(), getDate(issue.target_date) ?? new Date()) : 0;

  const showUpdateError = useCallback(
    (error: unknown) => {
      const errorData = error as TIssueWorkflowUpdateError;
      const approvalInitiated = isWorkflowApprovalInitiated(errorData);
      setToast({
        type: approvalInitiated ? TOAST_TYPE.INFO : TOAST_TYPE.ERROR,
        title: approvalInitiated ? "已发起审批流程" : t("common.error.label"),
        message:
          extractIssueUpdateErrorMessage(errorData) ??
          (approvalInitiated
            ? "该状态变更需审批人通过后才会生效"
            : t("entity.update.failed", { entity: t("issue.label") })),
      });
    },
    [t]
  );

  const update = useCallback(
    async (data: Partial<TIssue>) => {
      if (!updateIssue) return;
      try {
        await updateIssue(issue.project_id, issue.id, data);
      } catch (error) {
        showUpdateError(error);
      }
    },
    [issue.id, issue.project_id, showUpdateError, updateIssue]
  );

  const submitStateChange = useCallback((payload: TStateTransitionUpdatePayload) => update(payload), [update]);
  const handleState = useCallback(
    async (stateId: string) => {
      if (!updateIssue) return;
      await stateTransitionGuard.requestStateChange(issue, stateId, submitStateChange);
    },
    [issue, stateTransitionGuard, submitStateChange, updateIssue]
  );

  return (
    <>
      {/* 编号 */}
      <div className="flex min-w-0 items-center gap-1.5" style={indent ? { paddingLeft: indent } : undefined}>
        <span className="grid size-4 shrink-0 place-items-center">
          {subIssuesCount > 0 && (
            <button
              type="button"
              aria-label={isExpanded ? "收起子工作项" : "展开子工作项"}
              className="grid size-4 place-items-center rounded-xs text-placeholder hover:text-tertiary"
              onClick={onToggleExpand}
            >
              <ChevronRightIcon className={cn("size-4", { "rotate-90": isExpanded })} strokeWidth={2.5} />
            </button>
          )}
        </span>
        <WorkItemTypeIcon typeName={issue.type_name} fallbackIcon={typeIcon} />
        <span className="truncate text-13 text-tertiary tabular-nums">
          {projectIdentifier ? `${projectIdentifier}-${issue.sequence_id}` : issue.sequence_id}
        </span>
      </div>

      {/* 标题 */}
      <div className="flex min-w-0 items-center gap-2">
        <Tooltip tooltipContent={issue.name} isMobile={isMobile} position="top-start" renderByDefault={false}>
          <p className="truncate text-14 font-medium text-primary">{issue.name}</p>
        </Tooltip>
        {issue.project_id && workspaceSlug && (
          <IssueApprovalTag workspaceSlug={workspaceSlug} projectId={issue.project_id} issueId={issue.id} />
        )}
      </div>

      {/* 状态 */}
      <div className="-ml-2 min-w-0" onClick={stopPropagation} onFocus={stopPropagation}>
        <StateDropdown
          value={issue.state_id}
          onChange={handleState}
          projectId={issue.project_id}
          issueTypeId={issue.type_id}
          disabled={isReadOnly}
          buttonVariant="transparent-with-text"
          buttonContainerClassName="max-w-full truncate"
          renderByDefault={isMobile}
        />
      </div>

      {/* 优先级 */}
      <div className="-ml-2 min-w-0" onClick={stopPropagation} onFocus={stopPropagation}>
        <PriorityDropdown
          value={issue.priority}
          onChange={(value: TIssuePriorities) => void update({ priority: value })}
          disabled={isReadOnly}
          buttonVariant="transparent-with-text"
          renderByDefault={isMobile}
        />
      </div>

      {/* 截止日期：过期标红并写逾期天数 */}
      <div className="-ml-2 flex min-w-0 items-center gap-1" onClick={stopPropagation} onFocus={stopPropagation}>
        <DateDropdown
          value={issue.target_date}
          minDate={getDate(issue.start_date)}
          onChange={(date) => void update({ target_date: date ? renderFormattedPayloadDate(date) : null })}
          disabled={isReadOnly}
          placeholder="—"
          formatToken={getDateFormatToken(issue.target_date)}
          buttonVariant="transparent-with-text"
          buttonClassName={cn("tabular-nums", { "font-medium text-danger-primary": isOverdue })}
          clearIconClassName="!text-primary"
          optionsClassName="z-10"
          renderByDefault={isMobile}
        />
        {overdueDays > 0 && (
          <span className="shrink-0 rounded-sm bg-danger-subtle px-1.5 py-px text-11 font-medium text-danger-primary">
            {t("profile.overdue_days", { count: overdueDays })}
          </span>
        )}
      </div>

      {/* 项目 */}
      <div className="flex min-w-0">
        {projectIdentifier && (
          <span className="truncate rounded-md bg-layer-1 px-2 py-0.5 text-12 text-secondary">{projectIdentifier}</span>
        )}
      </div>

      {/* 负责人 */}
      <div className="flex min-w-0" onClick={stopPropagation} onFocus={stopPropagation}>
        <MemberDropdown
          projectId={issue.project_id}
          value={issue.assignee_ids}
          onChange={(ids: string[]) => void update({ assignee_ids: ids })}
          disabled={isReadOnly}
          multiple
          buttonVariant={issue.assignee_ids?.length > 0 ? "transparent-without-text" : "border-without-text"}
          buttonClassName={issue.assignee_ids?.length > 0 ? "hover:bg-transparent px-0" : ""}
          showTooltip={issue.assignee_ids?.length === 0}
          placeholder={t("common.assignees")}
          optionsClassName="z-10"
          tooltipContent=""
          renderByDefault={isMobile}
        />
      </div>

      {/* 更多操作：悬停才出 */}
      <div
        className="flex justify-end opacity-0 transition-opacity group-hover/list-block:opacity-100 focus-within:opacity-100"
        onClick={stopPropagation}
      >
        {quickActions}
      </div>

      <StateTransitionAssigneeModal {...stateTransitionGuard.modalProps} />
    </>
  );
});
