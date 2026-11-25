/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { ArrowRight } from "lucide-react";
import { EIconSize } from "@plane/constants";
import { StateGroupIcon } from "@plane/propel/icons";
import type { TIssue, TStateGroups } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { findValueForField, isValueEmpty } from "@/components/issues/extra-fields";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypeExtraFields } from "@/hooks/store/use-issue-type-extra-fields";
import { issueTransitionDraft } from "@/hooks/store/use-issue-transition-draft";
import { useProjectState } from "@/hooks/store/use-project-state";
// utils
import { evaluateFieldLinkage } from "@/utils/field-linkage";
import { ISSUE_LAYOUT_FOCUS_EVENT } from "@/utils/issue-type-layout";
import type { TIssueOperations } from "./root";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  /** 保存提交中：输入先锁住，否则提交后改的内容不会被带上 */
  disabled?: boolean;
};

type TStateLabelProps = { name: string; color: string; group: string; strong?: boolean };

const StateLabel = ({ name, color, group, strong }: TStateLabelProps) => (
  <span className={cn("inline-flex items-center gap-1.5", strong ? "font-medium text-primary" : "text-secondary")}>
    <StateGroupIcon stateGroup={group as TStateGroups} color={color} size={EIconSize.SM} />
    {name}
  </span>
);

/**
 * 点详情页流转按钮后，标题下方的提示条：这次流转从哪到哪、还差哪些必填字段（点了定位到字段）、
 * 需要时选处理人、填审批理由。值都走编辑会话暂存，点页头「确认流转 / 提交审批」一起提交。
 */
export const IssueTransitionBanner = observer(function IssueTransitionBanner(props: Props) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled = false } = props;
  const transition = issueTransitionDraft.get(issueId);
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const issue = getIssueById(issueId);
  const { fields } = useIssueTypeExtraFields(
    workspaceSlug,
    projectId,
    issue?.type_id ?? null,
    issue?.type_extra_fields ?? null
  );
  const [approvalReason, setApprovalReason] = useState("");

  useEffect(() => {
    setApprovalReason("");
  }, [transition?.id]);

  if (!issue || !transition) return null;

  const fromState = getStateById(transition.from_state_id);
  const values = issue.extra_field_values ?? [];
  // 联动隐藏的字段后端不校验，这里也不列
  const visibleIds = fields?.length ? new Set(evaluateFieldLinkage(fields, values).fields.map((f) => f.id)) : null;
  const requiredFields = transition.required_fields.filter((field) => !visibleIds || visibleIds.has(field.id));
  const filledCount = requiredFields.filter((field) => !isValueEmpty(findValueForField(values, field.id))).length;
  const assigneeIds = (issue.assignee_ids ?? []).filter((id) => transition.allowed_assignee_ids.includes(id));

  const focusField = (fieldId: string) =>
    window.dispatchEvent(new CustomEvent(ISSUE_LAYOUT_FOCUS_EVENT, { detail: { issueId, fieldId } }));

  return (
    <section
      aria-label="正在流转"
      className="flex flex-col gap-3.5 rounded-[10px] border border-accent-subtle bg-accent-subtle px-[18px] py-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-16 font-semibold text-primary">{transition.action_name}</span>
        <span className="inline-flex items-center gap-2 text-14">
          {fromState && <StateLabel name={fromState.name} color={fromState.color} group={fromState.group} />}
          <ArrowRight className="size-4 text-tertiary" aria-hidden="true" />
          <StateLabel
            name={transition.to_state_name}
            color={transition.to_state_color}
            group={transition.to_state_group}
            strong
          />
        </span>
      </div>

      {(requiredFields.length > 0 || transition.assignee_required) && (
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
          {requiredFields.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-14 text-secondary">
                流转必填
                <span className="ml-1.5 font-medium text-primary tabular-nums">
                  {filledCount} / {requiredFields.length}
                </span>
              </span>
              {requiredFields.map((field) => {
                const filled = !isValueEmpty(findValueForField(values, field.id));
                return (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => focusField(field.id)}
                    className={cn(
                      "inline-flex h-7 items-center rounded-md border px-2.5 text-13",
                      filled
                        ? "border-success-subtle bg-success-subtle text-success-primary"
                        : "border-accent-strong bg-surface-1 text-accent-primary hover:bg-accent-subtle-hover"
                    )}
                  >
                    {filled ? `${field.name} 已填写` : field.name}
                  </button>
                );
              })}
            </div>
          )}
          {transition.assignee_required && (
            <div className="flex items-center gap-2.5">
              <span className="text-14 text-secondary">
                处理人<span className="ml-0.5 text-danger-primary">*</span>
              </span>
              <div className="h-8 w-56">
                <MemberDropdown
                  multiple
                  value={assigneeIds}
                  onChange={(ids) =>
                    void issueOperations.update(workspaceSlug, projectId, issueId, { assignee_ids: ids })
                  }
                  projectId={projectId}
                  memberIds={transition.allowed_assignee_ids}
                  placeholder="请选择处理人"
                  buttonVariant="border-with-text"
                  dropdownArrow
                  className="w-full"
                  buttonContainerClassName="h-full w-full bg-surface-1 text-left"
                  disabled={disabled}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {transition.requires_approval && (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-3">
          <label htmlFor={`transition-reason-${issueId}`} className="pt-1.5 text-14 text-secondary">
            审批理由<span className="ml-0.5 text-danger-primary">*</span>
          </label>
          <textarea
            id={`transition-reason-${issueId}`}
            value={approvalReason}
            onChange={(event) => {
              setApprovalReason(event.target.value);
              // approval_reason 不是工作项字段，会话只把它记进草稿、随状态一起提交
              void issueOperations.update(workspaceSlug, projectId, issueId, {
                approval_reason: event.target.value,
              } as unknown as Partial<TIssue>);
            }}
            rows={3}
            disabled={disabled}
            placeholder="请填写审批理由"
            className="w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2 text-14 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
          />
        </div>
      )}
    </section>
  );
});
