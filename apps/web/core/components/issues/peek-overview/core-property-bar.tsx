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
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";
// plane web
import { DateAlert } from "@/plane-web/components/issues/issue-details/sidebar/date-alert";
import type { TIssueOperations } from "../issue-detail";

type TPeekCorePropertyBar = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled: boolean;
};

/**
 * 单行展示状态、优先级、负责人、起止日期，用于 Peek / 主内容窄屏，置于描述区域上方（参考设计稿的横向分隔 + 轻量控件的样式）
 */
export const PeekOverviewCorePropertyBar = observer(function PeekOverviewCorePropertyBar(
  props: TPeekCorePropertyBar
) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled } = props;
  const { t } = useTranslation();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();

  const issue = getIssueById(issueId);
  if (!issue) return <></>;
  const stateDetails = getStateById(issue.state_id);

  // 与 IssueTitleInput 的 TextArea（px-3）+ 容器 -ml-3 的文本起点一致；首列补 pl-3，并去掉状态按钮左侧默认内边距，避免相对标题再右偏
  const fieldShell = (index: number) =>
    cn(
      "flex min-h-7 min-w-0 flex-1 items-stretch",
      index === 0 && "pl-3",
      index > 0 && "border-l border-subtle pl-2.5"
    );

  return (
    <div
      className={cn(
        "mb-2 flex w-full min-w-0 flex-nowrap items-stretch text-body-xs-medium",
        disabled && "opacity-60"
      )}
    >
      <div className={fieldShell(0)}>
        <StateDropdown
          value={issue?.state_id}
          onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { state_id: val })}
          projectId={projectId}
          issueTypeId={issue?.type_id}
          disabled={disabled}
          buttonVariant="transparent-with-text"
          className="group w-full min-w-0"
          buttonContainerClassName="h-7 w-full min-w-0 text-left"
          buttonClassName={cn(
            "w-full min-w-0 truncate !pl-0 pr-1.5 text-body-xs-medium leading-5",
            issue?.state_id ? "text-secondary" : "text-placeholder"
          )}
        />
      </div>

      <div className={fieldShell(1)}>
        <PriorityDropdown
          value={issue?.priority}
          onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { priority: val })}
          disabled={disabled}
          buttonVariant="transparent-with-text"
          className="h-7 w-full min-w-0 rounded-sm"
          buttonContainerClassName="h-7 w-full min-w-0 text-left"
          buttonClassName={cn(
            "w-full min-w-0 truncate text-body-xs-medium leading-5 [&_svg]:size-3.5",
            !issue?.priority || issue?.priority === "none" ? "text-placeholder" : "text-secondary"
          )}
        />
      </div>

      <div className={fieldShell(2)}>
        <MemberDropdown
          value={issue?.assignee_ids ?? undefined}
          onChange={(val) => issueOperations.update(workspaceSlug, projectId, issueId, { assignee_ids: val })}
          disabled={disabled}
          projectId={projectId}
          placeholder={t("issue.add.assignee")}
          multiple
          buttonVariant={issue?.assignee_ids && issue.assignee_ids.length > 1 ? "transparent-without-text" : "transparent-with-text"}
          className="group w-full min-w-0"
          buttonContainerClassName="h-7 w-full min-w-0 text-left"
          buttonClassName={cn(
            "min-w-0 justify-start truncate text-body-xs-medium leading-5",
            (issue?.assignee_ids?.length ?? 0) > 0 ? "text-secondary" : "text-placeholder"
          )}
        />
      </div>

      <div className={fieldShell(3)}>
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
          className="group w-full min-w-0"
          buttonContainerClassName="h-7 w-full min-w-0 text-left"
          buttonClassName={cn(
            "w-full min-w-0 truncate text-body-xs-medium leading-5",
            !issue.start_date ? "text-placeholder" : "text-secondary"
          )}
          clearIconClassName="text-tertiary opacity-0 group-hover:opacity-100"
        />
      </div>

      <div className={fieldShell(4)}>
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
              placeholder={t("issue.add.due_date")}
              buttonVariant="transparent-with-text"
              disabled={disabled}
              className="group w-full min-w-0"
              buttonContainerClassName="h-7 w-full min-w-0 text-left"
              buttonClassName={cn(
                "w-full min-w-0 truncate text-body-xs-medium leading-5",
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
  );
});
