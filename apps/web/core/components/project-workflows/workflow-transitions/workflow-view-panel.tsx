/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useEffect, useMemo } from "react";
import { ArrowRight, Tag } from "lucide-react";
import { EIconSize } from "@plane/constants";
import { StateGroupIcon } from "@plane/propel/icons";
import { Avatar } from "@plane/ui";
import type { IState } from "@plane/types";
import { cn } from "@plane/utils";
import { useIssueTypeExtraFields } from "@/hooks/store/use-issue-type-extra-fields";
import { useMember } from "@/hooks/store/use-member";
import { useProjectRoles } from "@/hooks/store/use-project-roles";
import type { TWorkflowTransition } from "@/services/project/project-workflow.service";
import {
  WORKFLOW_SPECIAL_APPROVER_OPTIONS,
  getWorkflowApproverLabel,
  isRoleToken,
} from "./approver-utils";

export type TViewBox = "state" | "initiator" | "assignee" | "approver" | "fields";

type TWorkflowViewPanelProps = {
  box: TViewBox;
  transition: TWorkflowTransition;
  fromState: IState;
  allStates: IState[];
  workspaceSlug: string;
  projectId: string;
  issueTypeId: string;
  onClose: () => void;
};

const TITLE_BY_BOX: Record<TViewBox, string> = {
  state: "目标状态",
  initiator: "发起人",
  assignee: "目标负责人",
  approver: "审批人",
  fields: "必填字段",
};

const PRINCIPAL_DEFAULT: Record<
  "initiator" | "assignee" | "approver",
  { label: string; description: string }
> = {
  initiator: { label: "全部成员", description: "未配置发起人时默认全员可发起" },
  assignee: { label: "不约束", description: "未配置负责人规则时默认不限制" },
  approver: { label: "All", description: "未配置审批人时默认为直接通过" },
};

const isSpecialToken = (id: string) => WORKFLOW_SPECIAL_APPROVER_OPTIONS.some((option) => option.id === id);

export const WorkflowViewPanel: FC<TWorkflowViewPanelProps> = ({
  box,
  transition,
  fromState,
  allStates,
  workspaceSlug,
  projectId,
  issueTypeId,
  onClose,
}) => {
  const isPrincipal = box === "initiator" || box === "assignee" || box === "approver";

  const {
    getUserDetails,
    project: { getProjectMemberIds, fetchProjectMembers },
  } = useMember();
  const { roles, fetchRoles } = useProjectRoles(workspaceSlug, projectId);
  const { fields } = useIssueTypeExtraFields(workspaceSlug, projectId, issueTypeId, undefined, { lite: true });

  useEffect(() => {
    if (!isPrincipal) return;
    if (!getProjectMemberIds(projectId, false)) {
      void fetchProjectMembers(workspaceSlug, projectId);
    }
    if (roles.length === 0) {
      void fetchRoles();
    }
  }, [fetchProjectMembers, fetchRoles, getProjectMemberIds, isPrincipal, projectId, roles.length, workspaceSlug]);

  const roleTokenNameMap = useMemo(
    () =>
      roles.reduce<Record<string, string>>((acc, role) => {
        acc[role.id] = role.name;
        return acc;
      }, {}),
    [roles]
  );

  const fieldIdNameMap = useMemo(
    () =>
      (fields ?? []).reduce<Record<string, string>>((acc, field) => {
        acc[field.id] = field.name;
        return acc;
      }, {}),
    [fields]
  );

  const selectedToState = box === "state" ? allStates.find((state) => state.id === transition.to_state_id) : undefined;

  const principalIds = useMemo(() => {
    if (box === "initiator") return transition.initiator_ids;
    if (box === "assignee") return transition.assignee_ids;
    if (box === "approver") return transition.approver_ids;
    return [];
  }, [box, transition.approver_ids, transition.assignee_ids, transition.initiator_ids]);

  const approvalRuleText = useMemo(() => {
    if (transition.approver_ids.length === 0) return "无需指定审批人（All）";
    if (transition.approval_type === "all") return "需全部审批人通过";
    if (transition.approval_type === "any") return "任意一人通过即可";
    return `需 ${Math.max(1, transition.required_count || 1)} 人通过`;
  }, [transition.approval_type, transition.approver_ids.length, transition.required_count]);

  const renderBody = () => {
    if (box === "state") {
      return (
        <div className="flex h-9 items-center gap-2 rounded-md border border-subtle bg-surface-2 px-3 text-sm text-primary">
          {selectedToState ? (
            <>
              <StateGroupIcon stateGroup={selectedToState.group} color={selectedToState.color} size={EIconSize.SM} />
              <span className="truncate">{selectedToState.name}</span>
            </>
          ) : (
            <span className="truncate text-tertiary">目标状态已删除</span>
          )}
        </div>
      );
    }

    if (box === "fields") {
      if (transition.extra_field_ids.length === 0) {
        return (
          <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
            <Tag className="h-6 w-6 text-tertiary" strokeWidth={1.2} />
            <p className="text-xs text-tertiary">无需必填</p>
          </div>
        );
      }
      return (
        <div className="space-y-1.5">
          {transition.extra_field_ids.map((id) => (
            <div
              key={id}
              className="flex items-center gap-2 rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-sm text-primary"
            >
              <Tag className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              <span className="truncate">{fieldIdNameMap[id] ?? "字段已删除"}</span>
            </div>
          ))}
        </div>
      );
    }

    // principal: initiator / assignee / approver
    const dimension = box as "initiator" | "assignee" | "approver";
    return (
      <div className="space-y-3">
        {principalIds.length === 0 ? (
          <div className="rounded-md border border-subtle bg-surface-2 px-3 py-2">
            <p className="text-sm font-medium text-primary">{PRINCIPAL_DEFAULT[dimension].label}</p>
            <p className="mt-0.5 text-xs text-tertiary">{PRINCIPAL_DEFAULT[dimension].description}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {principalIds.map((id) => {
              const label = getWorkflowApproverLabel(id, getUserDetails, (roleId) => roleTokenNameMap[roleId]);
              const isMember = !isSpecialToken(id) && !isRoleToken(id);
              const user = isMember ? getUserDetails(id) : undefined;
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-sm text-primary"
                >
                  {isMember && <Avatar name={user?.display_name} src={user?.avatar_url} size="sm" className="flex-shrink-0" />}
                  <span className="truncate">{label}</span>
                </div>
              );
            })}
          </div>
        )}

        {dimension === "approver" && (
          <div className="rounded-md border border-subtle bg-surface-1 px-3 py-2">
            <p className="text-xs text-tertiary">审批规则</p>
            <p className="mt-0.5 text-sm text-primary">{approvalRuleText}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1">
      <div className="flex items-center gap-2 border-b border-subtle px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
          aria-label="关闭属性面板"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-medium text-primary">{TITLE_BY_BOX[box]}</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <p className={cn("mb-2 text-xs text-tertiary", box === "fields" && "mb-1")}>from {fromState.name}</p>
        {renderBody()}
      </div>
    </div>
  );
};
