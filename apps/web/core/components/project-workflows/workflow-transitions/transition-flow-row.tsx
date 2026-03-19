/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, MoreHorizontal, Users } from "lucide-react";
import { EIconSize } from "@plane/constants";
import { StateGroupIcon } from "@plane/propel/icons";
import type { IState } from "@plane/types";
import { Button } from "@plane/ui";
import { cn } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import type { TWorkflowTransition, TApprovalType } from "@/services/project/project-workflow.service";
import { getWorkflowApproverLabel } from "./approver-utils";

type TStep = 1 | 2 | 3 | "done";

type TTransitionFlowRowProps = {
  transition: TWorkflowTransition | null;
  fromState: IState;
  allStates: IState[];
  projectId: string;
  usedToStateIds: string[];
  isEditable: boolean;
  rowKey: string;
  activePanelOwner: string | null;
  onSetActivePanelOwner: (key: string | null) => void;
  onSave: (data: {
    id?: string;
    to_state_id: string;
    approver_ids: string[];
    approval_type: TApprovalType;
    required_count?: number;
  }) => Promise<void>;
  onDelete: (transitionId: string) => Promise<void>;
  onDiscard: () => void;
  onRequestStatePanel: (
    availableStates: IState[],
    currentValue: string | null,
    onConfirm: (stateId: string) => void
  ) => void;
  onRequestMemberPanel: (
    currentValue: string[],
    requiredCount: number,
    isNofM: boolean,
    onConfirm: (memberIds: string[], count: number, useNofM: boolean) => void,
    readOnly?: boolean
  ) => void;
  onRequestFlowPanel: (onConfirm: () => void) => void;
};

export const TransitionFlowRow: FC<TTransitionFlowRowProps> = ({
  transition,
  fromState,
  allStates,
  projectId,
  usedToStateIds,
  isEditable,
  rowKey,
  activePanelOwner,
  onSetActivePanelOwner,
  onSave,
  onDelete,
  onDiscard,
  onRequestStatePanel,
  onRequestMemberPanel,
  onRequestFlowPanel,
}) => {
  const [toStateId, setToStateId] = useState<string | null>(transition?.to_state_id ?? null);
  const [approverIds, setApproverIds] = useState<string[]>(transition?.approver_ids ?? []);
  const [requiredCount, setRequiredCount] = useState(transition?.required_count ?? 1);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [step, setStep] = useState<TStep>(transition ? "done" : 1);
  const [showMenu, setShowMenu] = useState(false);
  const [activeBox, setActiveBox] = useState<1 | 2 | 3 | null>(null);
  // For existing transitions, boxes are read-only until edit mode is activated
  const [isEditMode, setIsEditMode] = useState(!transition);
  const [isNofMApproval, setIsNofMApproval] = useState(transition?.approval_type === "n_of_m");

  const menuRef = useRef<HTMLDivElement>(null);
  const autoOpenedRef = useRef(false);
  const { getUserDetails } = useMember();

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  // When panel is closed (owner cleared), reset local activeBox
  useEffect(() => {
    if (activePanelOwner !== rowKey) {
      setActiveBox(null);
    }
  }, [activePanelOwner, rowKey]);

  const isNew = !transition;

  const isDirty =
    toStateId !== (transition?.to_state_id ?? null) ||
    JSON.stringify([...approverIds].sort()) !== JSON.stringify([...(transition?.approver_ids ?? [])].sort()) ||
    requiredCount !== (transition?.required_count ?? 1);

  const canSave = isNew ? step === "done" : toStateId !== null && isDirty;
  const showSaveCancel = isEditable && (isNew || (!isNew && (isDirty || isEditMode)));

  const selectedToState = toStateId ? allStates.find((s) => s.id === toStateId) : null;
  const isAllApprovers = approverIds.length === 0;
  const approverLabels = approverIds.map((id) => getWorkflowApproverLabel(id, getUserDetails));
  const approverSummaryLabel =
    approverLabels.length === 1
      ? approverLabels[0]
      : approverLabels.length === 2
        ? approverLabels.join("、")
        : `${approverLabels.length} 个审批对象`;

  const excludeIds = [fromState.id, ...usedToStateIds.filter((id) => id !== transition?.to_state_id)];
  const availableStates = allStates.filter((s) => !excludeIds.includes(s.id));

  // Whether this row currently owns the side panel
  const isOwner = activePanelOwner === rowKey;

  // Active box: panel ownership takes priority; for new rows also highlight the current wizard step
  const box1Active = (isOwner && activeBox === 1) || (isNew && step === 1 && !isOwner);
  const box2Active = (isOwner && activeBox === 2) || (isNew && step === 2 && !isOwner);
  const box3Active = (isOwner && activeBox === 3) || (isNew && step === 3 && !isOwner);

  // Whether each box has been completed (used for styling)
  const box1Done = isNew ? step !== 1 : true;
  const box2Done = isNew ? (step === 3 || step === "done") : true;
  const box3Done = isNew ? step === "done" : true;

  // Box 1 & 2 always visible for new rows so the user sees the full wizard upfront;
  // box 3 appears only once the user reaches step 3
  const showBox2 = true;
  const showBox3 = !isNew || step === 3 || step === "done";

  // Single continuous progress bar width (new flow only)
  const progressWidth = step === 1 ? "0%" : step === 2 ? "33.33%" : step === 3 ? "66.67%" : "100%";

  // ── Helpers to set/clear panel ownership ────────────────────────────────

  const claimPanel = (box: 1 | 2 | 3) => {
    setActiveBox(box);
    onSetActivePanelOwner(rowKey);
  };

  const releasePanel = () => {
    setActiveBox(null);
    onSetActivePanelOwner(null);
  };

  // ── Panel open handlers ──────────────────────────────────────────────────

  // Auto-open box 1 panel when a new row is first mounted
  useEffect(() => {
    if (isNew && isEditable && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      handleOpenFlowPanel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenFlowPanel = () => {
    if (!isEditable || (!isNew && !isEditMode)) return;
    if (isNew && step === 1) {
      // First-time wizard: chain through all steps
      claimPanel(1);
      onRequestFlowPanel(() => {
        setStep(2);
        claimPanel(2);
        onRequestStatePanel(availableStates, toStateId, (stateId) => {
          setToStateId(stateId);
          setStep(3);
          claimPanel(3);
          onRequestMemberPanel(approverIds, requiredCount, isNofMApproval, (ids, count, useNofM) => {
            setApproverIds(ids);
            setRequiredCount(count);
            setIsNofMApproval(useNofM);
            setStep("done");
            releasePanel();
          });
        });
      });
    } else {
      claimPanel(1);
      onRequestFlowPanel(() => {
        releasePanel();
      });
    }
  };

  const handleOpenStatePanel = () => {
    if (!isEditable || (!isNew && !isEditMode)) return;
    if (isNew) {
      // If user clicks box 2 before completing box 1, auto-advance step past 1
      if (step === 1) setStep(2);
      // For new rows: always chain through to member panel regardless of current step
      claimPanel(2);
      onRequestStatePanel(availableStates, toStateId, (stateId) => {
        setToStateId(stateId);
        setStep(3);
        claimPanel(3);
        onRequestMemberPanel(approverIds, requiredCount, isNofMApproval, (ids, count, useNofM) => {
          setApproverIds(ids);
          setRequiredCount(count);
          setIsNofMApproval(useNofM);
          setStep("done");
          releasePanel();
        });
      });
    } else {
      claimPanel(2);
      onRequestStatePanel(availableStates, toStateId, (stateId) => {
        setToStateId(stateId);
        releasePanel();
      });
    }
  };

  const handleOpenMemberPanel = () => {
    if (!isEditable) return;
    if (!isNew && !isEditMode) {
      // View-only: show current approvers without allowing edits
      onRequestMemberPanel(approverIds, requiredCount, isNofMApproval, () => {}, true);
      return;
    }
    claimPanel(3);
    onRequestMemberPanel(approverIds, requiredCount, isNofMApproval, (ids, count, useNofM) => {
      setApproverIds(ids);
      setRequiredCount(count);
      setIsNofMApproval(useNofM);
      if (isNew) setStep("done");
      releasePanel();
    });
  };

  // ── Save / Delete ────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!toStateId || isSaving) return;
    setIsSaving(true);
    try {
      const isAll = approverIds.length === 0;
      const approvalType: TApprovalType = isAll ? "all" : isNofMApproval ? "n_of_m" : "any";
      await onSave({
        id: transition?.id,
        to_state_id: toStateId,
        approver_ids: approverIds,
        approval_type: approvalType,
        // required_count only allowed when approval_type is n_of_m
        ...(approvalType === "n_of_m" ? { required_count: requiredCount } : {}),
      });
      if (!isNew) setIsEditMode(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!transition || isDeleting) return;
    setIsDeleting(true);
    setShowMenu(false);
    try {
      await onDelete(transition.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditClick = () => {
    setShowMenu(false);
    setIsEditMode(true);
    handleOpenMemberPanel();
  };

  const handleCancel = () => {
    // Reset to original values and exit edit mode
    setToStateId(transition?.to_state_id ?? null);
    setApproverIds(transition?.approver_ids ?? []);
    setRequiredCount(transition?.required_count ?? 1);
    setIsNofMApproval(transition?.approval_type === "n_of_m");
    setIsEditMode(false);
    releasePanel();
    onDiscard();
  };

  // ── Box shared styles ────────────────────────────────────────────────────

  const boxesClickable = isNew || isEditMode;

  const getBoxClassName = (isActive: boolean, isClickable = boxesClickable) =>
    cn(
      "flex h-9 w-full items-center gap-2 rounded-md border px-3 text-sm transition-colors",
      isActive && "border-accent-primary bg-accent-subtle/10",
      !isActive && isClickable && "border-subtle bg-surface-1 hover:bg-surface-2 cursor-pointer",
      !isActive && !isClickable && "border-subtle bg-surface-1 cursor-default select-none",
      !isEditable && "cursor-not-allowed opacity-60"
    );

  return (
    <div
      className={cn(
        "relative rounded-md border border-subtle bg-surface-1 transition-all",
        (isDirty || isNew) && "border-accent-primary/30 bg-accent-subtle/20"
      )}
    >
      <div className="px-3 pt-2.5 pb-3">
        {/* Boxes + menu button row */}
        <div className="flex items-start gap-2">
          {/* Three boxes in a fixed 3-column grid — positions never shift */}
          <div className="grid flex-1 grid-cols-3 gap-2">
            {/* box 1: via — always visible */}
            <div>
              <p className="mb-1 text-xs text-tertiary">via</p>
              <button
                type="button"
                onClick={handleOpenFlowPanel}
                disabled={!isEditable}
                className={getBoxClassName(box1Active, box1Done)}
              >
                <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
                <span className="flex-1 text-left text-primary">Transition</span>
              </button>
            </div>

            {/* box 2: move to — space always reserved; content invisible until step >= 2 */}
            <div className={cn(!showBox2 && "invisible pointer-events-none")}>
              <p className="mb-1 text-xs text-tertiary">move to</p>
              <button
                type="button"
                onClick={handleOpenStatePanel}
                disabled={!isEditable}
                className={getBoxClassName(box2Active, box2Done)}
              >
                {selectedToState ? (
                  <>
                    <StateGroupIcon stateGroup={selectedToState.group} color={selectedToState.color} size={EIconSize.SM} />
                    <span className="flex-1 truncate text-left text-primary">{selectedToState.name}</span>
                  </>
                ) : (
                  <span className="flex-1 text-left text-tertiary">选择目标状态</span>
                )}
              </button>
            </div>

            {/* box 3: by — space always reserved; content invisible until step >= 3 */}
            <div className={cn(!showBox3 && "invisible pointer-events-none")}>
              <p className="mb-1 text-xs text-tertiary">by</p>
              <button
                type="button"
                onClick={handleOpenMemberPanel}
                disabled={!isEditable}
                className={getBoxClassName(box3Active, true)}
              >
                <Users className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
                {isAllApprovers ? (
                  <span className="flex-1 text-left text-primary">All</span>
                ) : (
                  <span className="flex-1 truncate text-left text-primary">{approverSummaryLabel}</span>
                )}
              </button>
            </div>
          </div>

          {/* Existing rule: right-corner menu button */}
          {!isNew && isEditable && (
            <div ref={menuRef} className="relative flex-shrink-0 -pt-6">
              <button
                type="button"
                onClick={() => setShowMenu((prev) => !prev)}
                className="flex h-7 w-7 items-center justify-center rounded text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[100px] overflow-hidden rounded-md border border-subtle bg-surface-1 shadow-lg">
                  <button
                    type="button"
                    onClick={handleEditClick}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-primary transition-colors hover:bg-layer-1"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger-primary transition-colors hover:bg-danger-subtle disabled:opacity-50"
                  >
                    删除
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Single continuous progress bar spanning all three boxes (new flow only) */}
        {isNew && (
          <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-accent-primary transition-all duration-500 ease-out"
              style={{ width: progressWidth }}
            />
          </div>
        )}

        {/* Save / Cancel — below boxes */}
        {showSaveCancel && (
          <div className="mt-3 flex justify-end gap-1.5">
            <Button variant="neutral-primary" size="sm" onClick={isNew ? () => { releasePanel(); onDiscard(); } : handleCancel} disabled={isSaving}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving} disabled={!canSave}>
              保存
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
