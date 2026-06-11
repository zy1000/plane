/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { EIconSize } from "@plane/constants";
import { StateGroupIcon } from "@plane/propel/icons";
import type { IState } from "@plane/types";
import { Button, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TApprovalType, TWorkflowTransition } from "@/services/project/project-workflow.service";
import { ApprovalRuleSelect } from "./approval-rule-select";
import { FieldsSelect } from "./fields-select";
import { PrincipalSelect } from "./principal-select";
import { StateDropdown } from "./state-dropdown";

type TTransitionEditModalProps = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  issueTypeId: string;
  fromState: IState;
  allStates: IState[];
  usedToStateIds: string[];
  transition: TWorkflowTransition | null;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    to_state_id: string;
    initiator_ids: string[];
    assignee_ids: string[];
    approver_ids: string[];
    approval_type: TApprovalType;
    required_count?: number;
    extra_field_ids: string[];
  }) => Promise<void>;
};

type TTimelineItemProps = {
  title: string;
  description?: string;
  isLast?: boolean;
  children: ReactNode;
};

const TimelineItem: FC<TTimelineItemProps> = ({ title, description, isLast = false, children }) => (
  <div className="grid grid-cols-[16px_minmax(0,1fr)] gap-3">
    <div className="relative flex justify-center">
      <div className="mt-[9px] h-2 w-2 rounded-full bg-accent-primary" />
      {!isLast && <div className="absolute top-5 bottom-0 w-px bg-subtle" />}
    </div>
    <div className={cn("pb-4", isLast && "pb-0")}>
      <p className="text-sm font-medium text-primary">{title}</p>
      {description && <p className="mt-0.5 text-xs text-secondary">{description}</p>}
      <div className="mt-2">{children}</div>
    </div>
  </div>
);

const isSameTokenSet = (next: string[], prev: string[]) =>
  JSON.stringify([...next].sort()) === JSON.stringify([...prev].sort());

export const TransitionEditModal: FC<TTransitionEditModalProps> = ({
  isOpen,
  workspaceSlug,
  projectId,
  issueTypeId,
  fromState,
  allStates,
  usedToStateIds,
  transition,
  onClose,
  onSave,
}) => {
  const [toStateId, setToStateId] = useState<string | null>(transition?.to_state_id ?? null);
  const [initiatorIds, setInitiatorIds] = useState<string[]>(transition?.initiator_ids ?? []);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(transition?.assignee_ids ?? []);
  const [approverIds, setApproverIds] = useState<string[]>(transition?.approver_ids ?? []);
  const [requiredCount, setRequiredCount] = useState(transition?.required_count ?? 1);
  const [isNofMApproval, setIsNofMApproval] = useState(transition?.approval_type === "n_of_m");
  const [extraFieldIds, setExtraFieldIds] = useState<string[]>(transition?.extra_field_ids ?? []);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setToStateId(transition?.to_state_id ?? null);
    setInitiatorIds(transition?.initiator_ids ?? []);
    setAssigneeIds(transition?.assignee_ids ?? []);
    setApproverIds(transition?.approver_ids ?? []);
    setRequiredCount(transition?.required_count ?? 1);
    setIsNofMApproval(transition?.approval_type === "n_of_m");
    setExtraFieldIds(transition?.extra_field_ids ?? []);
  }, [isOpen, transition]);

  const excludeStateIds = useMemo(
    () => [fromState.id, ...usedToStateIds.filter((id) => id !== transition?.to_state_id)],
    [fromState.id, transition?.to_state_id, usedToStateIds]
  );

  const selectedToState = useMemo(
    () => (toStateId ? allStates.find((state) => state.id === toStateId) : null),
    [allStates, toStateId]
  );

  const isDirty =
    toStateId !== (transition?.to_state_id ?? null) ||
    !isSameTokenSet(initiatorIds, transition?.initiator_ids ?? []) ||
    !isSameTokenSet(assigneeIds, transition?.assignee_ids ?? []) ||
    !isSameTokenSet(approverIds, transition?.approver_ids ?? []) ||
    requiredCount !== (transition?.required_count ?? 1) ||
    !isSameTokenSet(extraFieldIds, transition?.extra_field_ids ?? []);

  const canSave = transition ? !!toStateId && isDirty : !!toStateId;

  const handleSave = async () => {
    if (!toStateId || isSaving) return;
    setIsSaving(true);
    try {
      const isAll = approverIds.length === 0;
      const approvalType: TApprovalType = isAll ? "all" : isNofMApproval ? "n_of_m" : "any";
      await onSave({
        id: transition?.id,
        to_state_id: toStateId,
        initiator_ids: initiatorIds,
        assignee_ids: assigneeIds,
        approver_ids: approverIds,
        approval_type: approvalType,
        ...(approvalType === "n_of_m" ? { required_count: requiredCount } : {}),
        extra_field_ids: extraFieldIds,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXL}
      className="h-[min(90vh,44rem)]"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-subtle px-5 py-4">
          <h3 className="text-base font-semibold text-primary">{transition ? "编辑流转" : "新建流转"}</h3>
          <p className="mt-1 text-xs text-secondary">
            从 <span className="font-medium text-primary">{fromState.name}</span> 配置工作流流转规则
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-modal-wheel-scroll>
          <div className="rounded-lg border border-subtle bg-surface-1 p-4">
            <TimelineItem title="起始状态" description="当前卡片所属状态（只读）">
              <div className="flex h-9 items-center gap-2 rounded-md border border-subtle bg-surface-2 px-3 text-sm text-primary">
                <StateGroupIcon stateGroup={fromState.group} color={fromState.color} size={EIconSize.SM} />
                <span className="truncate">{fromState.name}</span>
              </div>
            </TimelineItem>

            <TimelineItem title="移动到" description="设置该流转的目标状态">
              <StateDropdown
                states={allStates}
                value={toStateId}
                onChange={setToStateId}
                excludeStateIds={excludeStateIds}
                placeholder="选择目标状态"
              />
            </TimelineItem>

            <TimelineItem title="发起人" description="未配置时默认全部成员可发起">
              <PrincipalSelect
                dimension="initiator"
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                value={initiatorIds}
                onChange={(ids) => {
                  setInitiatorIds(ids);
                }}
              />
            </TimelineItem>

            <TimelineItem title="目标负责人" description="未配置时默认不限制负责人">
              <PrincipalSelect
                dimension="assignee"
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                value={assigneeIds}
                onChange={(ids) => {
                  setAssigneeIds(ids);
                }}
              />
            </TimelineItem>

            <TimelineItem
              title="审批人"
              description={selectedToState ? `通过后将进入 ${selectedToState.name}` : "配置审批对象"}
            >
              <PrincipalSelect
                dimension="approver"
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                value={approverIds}
                onChange={(ids) => {
                  setApproverIds(ids);
                  if (ids.length < 2) {
                    setRequiredCount(1);
                    setIsNofMApproval(false);
                    return;
                  }

                  setRequiredCount((current) => Math.min(Math.max(1, current), ids.length));
                }}
              />
            </TimelineItem>

            <TimelineItem title="审批规则" description="根据审批人数量设置通过规则">
              <ApprovalRuleSelect
                approverCount={approverIds.length}
                requiredCount={requiredCount}
                isNofM={isNofMApproval}
                onChange={(count, useNofM) => {
                  setRequiredCount(count);
                  setIsNofMApproval(useNofM);
                }}
              />
            </TimelineItem>

            <TimelineItem title="必填字段" description="审批通过前需要补齐的字段" isLast>
              <FieldsSelect
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueTypeId={issueTypeId}
                value={extraFieldIds}
                onChange={setExtraFieldIds}
              />
            </TimelineItem>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-3">
          <Button variant="neutral-primary" onClick={onClose} disabled={isSaving}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSave} loading={isSaving} disabled={!canSave}>
            保存
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
