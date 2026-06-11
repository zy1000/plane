/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Tag, Users } from "lucide-react";
import { EIconSize } from "@plane/constants";
import { StateGroupIcon } from "@plane/propel/icons";
import type { IState } from "@plane/types";
import { Button } from "@plane/ui";
import { cn } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import type { TApprovalType, TWorkflowTransition } from "@/services/project/project-workflow.service";
import { getWorkflowApproverLabel } from "./approver-utils";
import type { TPrincipalPanelDimension } from "./workflow-side-panel";

type TStep = 1 | 2 | 3 | 4 | 5 | "done";

type TPrincipalPanelOptions = {
  requiredCount?: number;
  isNofM?: boolean;
  showApprovalRule?: boolean;
  readOnly?: boolean;
  onNext?: (principalIds: string[], count: number, useNofM: boolean) => void;
};

type TTransitionFlowRowProps = {
  transition: TWorkflowTransition | null;
  fromState: IState;
  allStates: IState[];
  workspaceSlug: string;
  projectId: string;
  issueTypeId: string;
  usedToStateIds: string[];
  isEditable: boolean;
  rowKey: string;
  activePanelOwner: string | null;
  onSetActivePanelOwner: (key: string | null) => void;
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
  onDelete: (transitionId: string) => Promise<void>;
  onDiscard: () => void;
  onRequestStatePanel: (
    availableStates: IState[],
    currentValue: string | null,
    onConfirm: (stateId: string) => void
  ) => void;
  onRequestPrincipalPanel: (
    dimension: TPrincipalPanelDimension,
    currentValue: string[],
    onConfirm: (principalIds: string[], count: number, useNofM: boolean) => void,
    options?: TPrincipalPanelOptions
  ) => void;
  onRequestFlowPanel: (onConfirm: () => void) => void;
  onRequestFieldsPanel: (
    currentValue: string[],
    onConfirm: (extraFieldIds: string[]) => void,
    readOnly?: boolean
  ) => void;
};

const isSameTokenSet = (next: string[], prev: string[]) =>
  JSON.stringify([...next].sort()) === JSON.stringify([...prev].sort());

export const TransitionFlowRow: FC<TTransitionFlowRowProps> = ({
  transition,
  fromState,
  allStates,
  usedToStateIds,
  isEditable,
  rowKey,
  activePanelOwner,
  onSetActivePanelOwner,
  onSave,
  onDelete,
  onDiscard,
  onRequestStatePanel,
  onRequestPrincipalPanel,
  onRequestFlowPanel,
  onRequestFieldsPanel,
}) => {
  const [toStateId, setToStateId] = useState<string | null>(transition?.to_state_id ?? null);
  const [initiatorIds, setInitiatorIds] = useState<string[]>(transition?.initiator_ids ?? []);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(transition?.assignee_ids ?? []);
  const [approverIds, setApproverIds] = useState<string[]>(transition?.approver_ids ?? []);
  const [requiredCount, setRequiredCount] = useState(transition?.required_count ?? 1);
  const [extraFieldIds, setExtraFieldIds] = useState<string[]>(transition?.extra_field_ids ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [step, setStep] = useState<TStep>(transition ? "done" : 1);
  const [showMenu, setShowMenu] = useState(false);
  const [activeBox, setActiveBox] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  // Existing transitions are read-only until entering edit mode.
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

  useEffect(() => {
    if (activePanelOwner !== rowKey) {
      setActiveBox(null);
    }
  }, [activePanelOwner, rowKey]);

  const isNew = !transition;
  const selectedToState = toStateId ? allStates.find((s) => s.id === toStateId) : null;
  const excludeIds = [fromState.id, ...usedToStateIds.filter((id) => id !== transition?.to_state_id)];
  const availableStates = allStates.filter((s) => !excludeIds.includes(s.id));

  const isDirty =
    toStateId !== (transition?.to_state_id ?? null) ||
    !isSameTokenSet(initiatorIds, transition?.initiator_ids ?? []) ||
    !isSameTokenSet(assigneeIds, transition?.assignee_ids ?? []) ||
    !isSameTokenSet(approverIds, transition?.approver_ids ?? []) ||
    requiredCount !== (transition?.required_count ?? 1) ||
    !isSameTokenSet(extraFieldIds, transition?.extra_field_ids ?? []);

  const canSave = isNew ? step === "done" : toStateId !== null && isDirty;
  const showSaveCancel = isEditable && (isNew || (!isNew && (isDirty || isEditMode)));
  const isOwner = activePanelOwner === rowKey;

  const getPrincipalSummary = (ids: string[], emptyLabel: string) => {
    if (ids.length === 0) return emptyLabel;
    const labels = ids.map((id) => getWorkflowApproverLabel(id, getUserDetails));
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return labels.join("、");
    return `${labels.length} 个对象`;
  };

  const initiatorSummary = getPrincipalSummary(initiatorIds, "All");
  const assigneeSummary = getPrincipalSummary(assigneeIds, "不约束");
  const approverSummary = getPrincipalSummary(approverIds, "All");

  const box2Active = (isOwner && activeBox === 2) || (isNew && step === 2 && !isOwner);
  const box3Active = (isOwner && activeBox === 3) || (isNew && step === 3 && !isOwner);
  const box4Active = (isOwner && activeBox === 4) || (isNew && step === 4 && !isOwner);
  const box5Active = (isOwner && activeBox === 5) || (isNew && step === 5 && !isOwner);

  const box2Done = isNew ? [3, 4, 5, "done"].includes(step) : true;
  const box3Done = isNew ? [4, 5, "done"].includes(step) : true;
  const box4Done = isNew ? [5, "done"].includes(step) : true;
  const box5Done = isNew ? step === "done" : true;

  const progressWidth =
    step === 1
      ? "0%"
      : step === 2
        ? "20%"
        : step === 3
          ? "40%"
          : step === 4
            ? "60%"
            : step === 5
              ? "80%"
              : "100%";

  const claimPanel = (box: 1 | 2 | 3 | 4 | 5) => {
    setActiveBox(box);
    onSetActivePanelOwner(rowKey);
  };

  const releasePanel = () => {
    setActiveBox(null);
    onSetActivePanelOwner(null);
  };

  const openPrincipalPanel = (
    dimension: TPrincipalPanelDimension,
    currentValue: string[],
    onConfirm: (principalIds: string[], count: number, useNofM: boolean) => void,
    options?: TPrincipalPanelOptions
  ) => {
    onRequestPrincipalPanel(dimension, currentValue, onConfirm, options);
  };

  const openApproverChain = () => {
    claimPanel(5);
    openPrincipalPanel(
      "approver",
      approverIds,
      () => {},
      {
        requiredCount,
        isNofM: isNofMApproval,
        showApprovalRule: true,
        onNext: (ids, count, useNofM) => {
          setApproverIds(ids);
          setRequiredCount(count);
          setIsNofMApproval(useNofM);
          onRequestFieldsPanel(extraFieldIds, (fieldIds) => {
            setExtraFieldIds(fieldIds);
            if (isNew) setStep("done");
            releasePanel();
          });
        },
      }
    );
  };

  const openAssigneeChain = () => {
    claimPanel(4);
    openPrincipalPanel(
      "assignee",
      assigneeIds,
      () => {},
      {
        showApprovalRule: false,
        onNext: (ids) => {
          setAssigneeIds(ids);
          setStep(5);
          openApproverChain();
        },
      }
    );
  };

  const openInitiatorChain = () => {
    claimPanel(3);
    openPrincipalPanel(
      "initiator",
      initiatorIds,
      () => {},
      {
        showApprovalRule: false,
        onNext: (ids) => {
          setInitiatorIds(ids);
          setStep(4);
          openAssigneeChain();
        },
      }
    );
  };

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
      claimPanel(1);
      onRequestFlowPanel(() => {
        setStep(2);
        claimPanel(2);
        onRequestStatePanel(availableStates, toStateId, (stateId) => {
          setToStateId(stateId);
          setStep(3);
          openInitiatorChain();
        });
      });
      return;
    }
    claimPanel(1);
    onRequestFlowPanel(() => {
      releasePanel();
    });
  };

  const handleOpenStatePanel = () => {
    if (!isEditable || (!isNew && !isEditMode)) return;
    if (isNew) {
      if (step === 1) setStep(2);
      claimPanel(2);
      onRequestStatePanel(availableStates, toStateId, (stateId) => {
        setToStateId(stateId);
        setStep(3);
        openInitiatorChain();
      });
      return;
    }
    claimPanel(2);
    onRequestStatePanel(availableStates, toStateId, (stateId) => {
      setToStateId(stateId);
      releasePanel();
    });
  };

  const handleOpenInitiatorPanel = (forceEditable = false) => {
    if (!isEditable) {
      if (!isNew) {
        openPrincipalPanel("initiator", initiatorIds, () => {}, { readOnly: true });
      }
      return;
    }
    if (!isNew && !isEditMode && !forceEditable) {
      openPrincipalPanel("initiator", initiatorIds, () => {}, { readOnly: true });
      return;
    }
    if (isNew) {
      if (step < 3) setStep(3);
      openInitiatorChain();
      return;
    }
    claimPanel(3);
    openPrincipalPanel(
      "initiator",
      initiatorIds,
      (ids) => {
        setInitiatorIds(ids);
        releasePanel();
      },
      {
        showApprovalRule: false,
      }
    );
  };

  const handleOpenAssigneePanel = (forceEditable = false) => {
    if (!isEditable) {
      if (!isNew) {
        openPrincipalPanel("assignee", assigneeIds, () => {}, { readOnly: true });
      }
      return;
    }
    if (!isNew && !isEditMode && !forceEditable) {
      openPrincipalPanel("assignee", assigneeIds, () => {}, { readOnly: true });
      return;
    }
    if (isNew) {
      if (step < 4) setStep(4);
      openAssigneeChain();
      return;
    }
    claimPanel(4);
    openPrincipalPanel(
      "assignee",
      assigneeIds,
      (ids) => {
        setAssigneeIds(ids);
        releasePanel();
      },
      {
        showApprovalRule: false,
      }
    );
  };

  const handleOpenApproverPanel = (forceEditable = false) => {
    if (!isEditable) {
      if (!isNew) {
        openPrincipalPanel("approver", approverIds, () => {}, {
          readOnly: true,
          requiredCount,
          isNofM: isNofMApproval,
          showApprovalRule: true,
        });
      }
      return;
    }
    if (!isNew && !isEditMode && !forceEditable) {
      openPrincipalPanel("approver", approverIds, () => {}, {
        readOnly: true,
        requiredCount,
        isNofM: isNofMApproval,
        showApprovalRule: true,
      });
      return;
    }
    claimPanel(5);
    openPrincipalPanel(
      "approver",
      approverIds,
      () => {},
      {
        requiredCount,
        isNofM: isNofMApproval,
        showApprovalRule: true,
        onNext: (ids, count, useNofM) => {
          setApproverIds(ids);
          setRequiredCount(count);
          setIsNofMApproval(useNofM);
          onRequestFieldsPanel(extraFieldIds, (fieldIds) => {
            setExtraFieldIds(fieldIds);
            if (isNew) setStep("done");
            releasePanel();
          });
        },
      }
    );
  };

  const handleOpenFieldsPanel = (forceEditable = false) => {
    if (!isEditable) {
      if (!isNew) {
        onRequestFieldsPanel(extraFieldIds, () => {}, true);
      }
      return;
    }
    if (!isNew && !isEditMode && !forceEditable) {
      onRequestFieldsPanel(extraFieldIds, () => {}, true);
      return;
    }
    onRequestFieldsPanel(extraFieldIds, (ids) => {
      setExtraFieldIds(ids);
      if (isNew) setStep("done");
    });
  };

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
    handleOpenApproverPanel(true);
  };

  const handleCancel = () => {
    setToStateId(transition?.to_state_id ?? null);
    setInitiatorIds(transition?.initiator_ids ?? []);
    setAssigneeIds(transition?.assignee_ids ?? []);
    setApproverIds(transition?.approver_ids ?? []);
    setRequiredCount(transition?.required_count ?? 1);
    setIsNofMApproval(transition?.approval_type === "n_of_m");
    setExtraFieldIds(transition?.extra_field_ids ?? []);
    setIsEditMode(false);
    releasePanel();
    onDiscard();
  };

  const boxesClickable = isNew || isEditMode;

  const getBoxClassName = (isActive: boolean, isClickable = boxesClickable, allowReadOnlyView = false) =>
    cn(
      "flex h-9 w-full items-center gap-2 rounded-md border px-3 text-sm transition-colors",
      isActive && "border-accent-primary bg-accent-subtle/10",
      !isActive && isClickable && "border-subtle bg-surface-1 hover:bg-surface-2 cursor-pointer",
      !isActive && !isClickable && "border-subtle bg-surface-1 cursor-default select-none",
      !isEditable && !allowReadOnlyView && "cursor-not-allowed opacity-60"
    );

  return (
    <div
      className={cn(
        "relative rounded-md border border-subtle bg-surface-1 transition-all",
        (isDirty || isNew) && "border-accent-primary/30 bg-accent-subtle/20"
      )}
    >
      {!isNew && isEditable && (
        <div ref={menuRef} className="absolute top-2 right-2 z-10">
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

      <div className="px-3 pt-2.5 pb-3 pr-9">
        <div className="grid grid-cols-5 gap-2">
          <div>
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

          <div>
            <p className="mb-1 text-xs text-tertiary">发起人</p>
            <button
              type="button"
              onClick={() => handleOpenInitiatorPanel()}
              disabled={isNew && !isEditable}
              className={getBoxClassName(box3Active, true, !isNew)}
            >
              <Users className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              <span className="flex-1 truncate text-left text-primary">{initiatorSummary}</span>
            </button>
          </div>

          <div>
            <p className="mb-1 text-xs text-tertiary">目标负责人</p>
            <button
              type="button"
              onClick={() => handleOpenAssigneePanel()}
              disabled={isNew && !isEditable}
              className={getBoxClassName(box4Active, true, !isNew)}
            >
              <Users className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              <span className="flex-1 truncate text-left text-primary">{assigneeSummary}</span>
            </button>
          </div>

          <div>
            <p className="mb-1 text-xs text-tertiary">审批人</p>
            <button
              type="button"
              onClick={() => handleOpenApproverPanel()}
              disabled={isNew && !isEditable}
              className={getBoxClassName(box5Active, true, !isNew)}
            >
              <Users className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              <span className="flex-1 truncate text-left text-primary">{approverSummary}</span>
            </button>
          </div>

          <div>
            <p className="mb-1 text-xs text-tertiary">requiring</p>
            <button
              type="button"
              onClick={() => handleOpenFieldsPanel()}
              disabled={isNew && !isEditable}
              className={getBoxClassName(false, box5Done, !isNew)}
            >
              <Tag className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              {extraFieldIds.length === 0 ? (
                <span className="flex-1 text-left text-tertiary">无需必填</span>
              ) : (
                <span className="flex-1 truncate text-left text-primary">{extraFieldIds.length} 个字段</span>
              )}
            </button>
          </div>
        </div>

        {isNew && (
          <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-accent-primary transition-all duration-500 ease-out"
              style={{ width: progressWidth }}
            />
          </div>
        )}

        {showSaveCancel && (
          <div className="mt-3 flex justify-end gap-1.5">
            <Button
              variant="neutral-primary"
              size="sm"
              onClick={
                isNew
                  ? () => {
                      releasePanel();
                      onDiscard();
                    }
                  : handleCancel
              }
              disabled={isSaving}
            >
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
