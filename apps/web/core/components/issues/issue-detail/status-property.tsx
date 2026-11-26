/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { ArrowRight, Loader2, Workflow } from "lucide-react";
import { EIconSize } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { StateGroupIcon, StatePropertyIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TStateGroups } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { findValueForField, isValueEmpty } from "@/components/issues/extra-fields";
import { IssueApprovalTag } from "@/components/issues/issue-approval-tag";
// hooks
import { useIssueApprovalStatus } from "@/hooks/store/use-issue-approval-status";
import { useIssueAvailableTransitions } from "@/hooks/store/use-issue-available-transitions";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useStateTransitionAssigneeGuard } from "@/hooks/store/use-state-transition-assignee-guard";
import { useUser } from "@/hooks/store/user";
import type { TIssueEditSession } from "@/hooks/use-issue-edit-session";
// services
import type { TAvailableTransition } from "@/services/project/project-workflow.service";
import { ProjectWorkflowService } from "@/services/project/project-workflow.service";
// local
import { StructureFieldLabel, StructureFieldValue } from "../peek-overview/property-field";
import { StateTransitionAssigneeModal } from "../state-transition-assignee-modal";

const workflowService = new ProjectWorkflowService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  session: TIssueEditSession;
  /** 有编辑权限且未归档：才能改状态、才出流转按钮；审批中的情况所有人都看得到 */
  canEdit: boolean;
  isArchived?: boolean;
  /** rows：右栏「属性」下独立的一块，排法同属性行；inline：没有右栏时横排放在标题下 */
  layout?: "rows" | "inline";
  /** 外层显隐用（可能带 xx:block，不能直接挂在 grid 上，所以 rows 外面多包一层） */
  className?: string;
};

type TStateIconProps = { color?: string | null; group?: string | null; order?: number };
type TStateLabelProps = TStateIconProps & { name: string; muted?: boolean };

/** 画法同状态下拉：16px，带 order（未开始 / 进行中组按它画进度） */
const StateIcon = ({ color, group, order }: TStateIconProps) =>
  group ? (
    <StateGroupIcon
      stateGroup={group as TStateGroups}
      color={color ?? undefined}
      size={EIconSize.LG}
      percentage={order}
    />
  ) : null;

const StateLabel = ({ name, muted, ...icon }: TStateLabelProps) => (
  <span className={`inline-flex min-w-0 items-center gap-1.5 text-body-xs-medium ${muted ? "text-tertiary" : "text-secondary"}`}>
    <StateIcon {...icon} />
    <span className="truncate">{name}</span>
  </span>
);

const ROWS_GRID = "grid w-full grid-cols-[minmax(7.5rem,max-content)_minmax(0,1fr)] gap-x-2 gap-y-2";
/** rows 里只读的值：左缘、行高同其他属性值 */
const ROW_VALUE = "flex min-h-7.5 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-2";
const INLINE_LABEL = "shrink-0 text-body-xs-regular text-tertiary";
const TAG = "shrink-0 rounded-sm bg-warning-subtle px-1.5 text-12 leading-[18px] font-medium text-warning-primary";

/**
 * 工作项的「状态」属性：当前状态 + 从它出发的流转按钮（全部平铺；当前用户不能发起的置灰并写明谁可以发起）。
 * 有要填的（必填字段没填、要指定处理人、要审批）→ 进入编辑态，状态显示「起 → 止」；什么都不用填 → 直接流转。
 * 有待审批的流转时显示目标状态与「查看审批」，发起人可撤回。状态下拉只在编辑态可改。
 */
export const IssueStatusProperty = observer(function IssueStatusProperty(props: Props) {
  const {
    workspaceSlug,
    projectId,
    issueId,
    session,
    canEdit,
    isArchived = false,
    layout = "rows",
    className,
  } = props;
  const { t } = useTranslation();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const { data: currentUser } = useUser();
  const stateTransitionGuard = useStateTransitionAssigneeGuard(workspaceSlug, projectId);
  const issue = getIssueById(issueId);
  const { records, hasPendingApproval, invalidate } = useIssueApprovalStatus(workspaceSlug, projectId, issueId);
  const { transitions, refresh } = useIssueAvailableTransitions(
    workspaceSlug,
    projectId,
    issueId,
    issue?.state_id,
    canEdit && !isArchived && !hasPendingApproval
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  // 本地状态是先乐观改的，随状态变化拉的列表可能早于 PATCH 落库；编辑会话结束（保存完 / 取消）再拉一次
  const wasEditing = useRef(session.isEditing);
  useEffect(() => {
    if (wasEditing.current && !session.isEditing) void refresh();
    wasEditing.current = session.isEditing;
  }, [refresh, session.isEditing]);

  if (!issue) return null;

  const rows = layout === "rows";
  const currentState = getStateById(issue.state_id);
  const activeTransition = session.isEditing ? session.transition : null;
  const pendingRecord = !isArchived && hasPendingApproval && !activeTransition ? records[0] : undefined;
  const stateEditable = canEdit && !isArchived && session.isEditing && !session.isSaving && !activeTransition;
  const showTransitions = canEdit && !isArchived && !session.isEditing && !pendingRecord && transitions.length > 0;

  const handleStateChange = async (nextStateId: string) => {
    await stateTransitionGuard.requestStateChange(issue, nextStateId, async (payload) => {
      await session.operations.update(workspaceSlug, projectId, issueId, payload);
    });
  };

  const needsInput = (transition: TAvailableTransition) => {
    const values = issue.extra_field_values ?? [];
    return (
      transition.requires_approval ||
      transition.assignee_required ||
      transition.required_fields.some((field) => isValueEmpty(findValueForField(values, field.id)))
    );
  };

  const handleStart = async (transition: TAvailableTransition) => {
    if (needsInput(transition)) {
      session.startTransition(transition);
      return;
    }
    setBusyId(transition.id);
    try {
      await session.operations.update(workspaceSlug, projectId, issueId, { state_id: transition.to_state_id });
    } finally {
      setBusyId(null);
      invalidate();
      // PATCH 已经结束，按库里的状态重拉
      void refresh();
    }
  };

  const handleWithdraw = async (recordId: string) => {
    setBusyId(recordId);
    try {
      await workflowService.withdrawTransitionRecord(workspaceSlug, projectId, recordId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已撤回", message: "状态流转申请已撤回" });
    } catch (error) {
      const message = (error as { error?: string } | undefined)?.error ?? "撤回失败，请重试";
      setToast({ type: TOAST_TYPE.ERROR, title: "撤回失败", message });
    } finally {
      setBusyId(null);
      invalidate();
    }
  };

  const renderTransition = (transition: TAvailableTransition) => {
    const path = `${currentState?.name ?? ""} → ${transition.to_state_name}`;
    const reason = transition.can_initiate
      ? null
      : transition.initiator_labels.length > 0
        ? `仅 ${transition.initiator_labels.join("、")} 可发起`
        : "当前账号不在发起人范围内";
    const busy = busyId === transition.id;
    const title = (
      <>
        <StateIcon
          color={transition.to_state_color}
          group={transition.to_state_group}
          order={getStateById(transition.to_state_id)?.order}
        />
        <span className="truncate">{transition.action_name}</span>
        {transition.requires_approval && <span className={TAG}>需审批</span>}
      </>
    );
    return (
      // 禁用的按钮不响应鼠标，提示挂在外层 span 上；竖排时不能发起的原因直接写在按钮里
      <Tooltip
        key={transition.id}
        tooltipContent={
          rows || !reason ? (
            path
          ) : (
            <div className="space-y-0.5">
              <div>{path}</div>
              <div>{reason}</div>
            </div>
          )
        }
        position={rows ? "left" : "bottom"}
      >
        <span className={rows ? "flex w-full" : "inline-flex max-w-full"}>
          <button
            type="button"
            disabled={!transition.can_initiate || busyId !== null}
            onClick={() => void handleStart(transition)}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-md border border-subtle bg-surface-1 text-13 font-medium text-secondary shadow-raised-100 transition-colors outline-none focus-visible:border-accent-strong",
              "enabled:hover:border-strong enabled:hover:bg-layer-1-hover disabled:cursor-not-allowed",
              rows ? "min-h-8 w-full justify-between px-2.5 py-1.5" : "h-7.5 px-3"
            )}
          >
            {rows ? (
              <>
                <span className="flex min-w-0 flex-col gap-1 text-left">
                  <span className={cn("flex min-w-0 items-center gap-1.5", reason && "opacity-50")}>{title}</span>
                  {reason && <span className="text-12 leading-[18px] font-normal text-balance text-tertiary">{reason}</span>}
                </span>
                {busy ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-tertiary" aria-hidden="true" />
                ) : (
                  <ArrowRight
                    className={cn("size-4 shrink-0 text-tertiary", reason && "opacity-50")}
                    aria-hidden="true"
                  />
                )}
              </>
            ) : (
              <span className={cn("flex min-w-0 items-center gap-1.5", reason && "opacity-50")}>
                {busy && <Loader2 className="size-4 shrink-0 animate-spin text-tertiary" aria-hidden="true" />}
                {title}
              </span>
            )}
          </button>
        </span>
      </Tooltip>
    );
  };

  // 流转编辑中：起 → 止
  const fromState = activeTransition ? getStateById(activeTransition.from_state_id) : undefined;
  const flowPath = activeTransition && (
    <>
      {fromState && (
        <StateLabel
          name={fromState.name}
          color={fromState.color}
          // 属性行的值列窄，起始状态只留名称，「起 → 止」尽量排在一行
          group={rows ? null : fromState.group}
          order={fromState.order}
          muted
        />
      )}
      <ArrowRight className="size-4 shrink-0 text-accent-primary" aria-hidden="true" />
      <StateLabel
        name={activeTransition.to_state_name}
        color={activeTransition.to_state_color}
        group={activeTransition.to_state_group}
        order={getStateById(activeTransition.to_state_id)?.order}
      />
    </>
  );

  // 审批中：目标状态 + 查看审批 / 撤回
  const pendingTarget = pendingRecord && (
    <>
      <StateLabel
        name={pendingRecord.to_state_name ?? pendingRecord.action_name}
        color={pendingRecord.to_state_color}
        group={pendingRecord.to_state_group}
        order={getStateById(pendingRecord.to_state_id)?.order}
      />
      <span className={TAG}>审批中</span>
    </>
  );
  const pendingActions = pendingRecord && (
    <>
      <IssueApprovalTag workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} variant="button" />
      {pendingRecord.created_by === currentUser?.id && (
        <Button
          variant="secondary"
          size="lg"
          onClick={() => void handleWithdraw(pendingRecord.id)}
          loading={busyId !== null}
        >
          撤回
        </Button>
      )}
    </>
  );

  const stateLabel = t("common.state");

  return (
    <>
      {rows ? (
        <div className={className}>
          <div className={ROWS_GRID}>
            <StructureFieldLabel icon={StatePropertyIcon} label={stateLabel} />
            <StructureFieldValue>
              {activeTransition ? (
                <div className={ROW_VALUE}>{flowPath}</div>
              ) : (
                <StateDropdown
                  value={issue.state_id}
                  onChange={handleStateChange}
                  projectId={projectId}
                  issueTypeId={issue.type_id}
                  disabled={!stateEditable}
                  buttonVariant="transparent-with-text"
                  className="group w-full"
                  buttonContainerClassName="w-full text-left h-7.5 rounded-sm"
                  buttonClassName="text-body-xs-medium justify-between"
                  dropdownArrow
                  dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
                />
              )}
            </StructureFieldValue>

            {pendingRecord ? (
              <>
                <StructureFieldLabel icon={Workflow} label="流转至" />
                <StructureFieldValue>
                  <div className={ROW_VALUE}>{pendingTarget}</div>
                </StructureFieldValue>
                <div className="col-start-2 flex flex-wrap items-center gap-2 pl-2">{pendingActions}</div>
              </>
            ) : showTransitions ? (
              <>
                <StructureFieldLabel icon={Workflow} label="流转至" />
                <div className="col-span-2 flex flex-col gap-2">{transitions.map(renderTransition)}</div>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <section aria-label={stateLabel} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
          <span className={INLINE_LABEL}>{stateLabel}</span>
          {activeTransition ? (
            flowPath
          ) : stateEditable ? (
            <StateDropdown
              value={issue.state_id}
              onChange={handleStateChange}
              projectId={projectId}
              issueTypeId={issue.type_id}
              buttonVariant="border-with-text"
              className="min-w-0"
              buttonContainerClassName="h-7.5 max-w-full text-left"
              buttonClassName="text-body-xs-medium"
              dropdownArrow
            />
          ) : (
            currentState && (
              <StateLabel
                name={currentState.name}
                color={currentState.color}
                group={currentState.group}
                order={currentState.order}
              />
            )
          )}

          {(pendingRecord || showTransitions) && (
            <>
              <span aria-hidden="true" className="mx-1 h-5 border-l border-subtle" />
              <span className={INLINE_LABEL}>流转至</span>
              {pendingRecord ? (
                <>
                  {pendingTarget}
                  {pendingActions}
                </>
              ) : (
                transitions.map(renderTransition)
              )}
            </>
          )}
        </section>
      )}
      <StateTransitionAssigneeModal {...stateTransitionGuard.modalProps} />
    </>
  );
});
