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
import { cn } from "@plane/utils";
import type { TWorkflowTransition } from "@/services/project/project-workflow.service";
import { isRoleToken, WORKFLOW_SPECIAL_APPROVER_OPTIONS } from "./approver-utils";
import type { TViewBox } from "./workflow-view-panel";

type TTransitionFlowRowProps = {
  transition: TWorkflowTransition;
  allStates: IState[];
  isEditable: boolean;
  activeViewBox: TViewBox | null;
  onViewBox: (box: TViewBox) => void;
  onEdit: () => void;
  onDelete: (transitionId: string) => Promise<void>;
};

export const TransitionFlowRow: FC<TTransitionFlowRowProps> = ({
  transition,
  allStates,
  isEditable,
  activeViewBox,
  onViewBox,
  onEdit,
  onDelete,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedToState = allStates.find((state) => state.id === transition.to_state_id);

  const getPrincipalSummary = (ids: string[], emptyLabel: string) => {
    if (ids.length === 0) return emptyLabel;
    let roleCount = 0;
    let memberCount = 0;
    const specialLabels: string[] = [];
    ids.forEach((id) => {
      const specialOption = WORKFLOW_SPECIAL_APPROVER_OPTIONS.find((option) => option.id === id);
      if (specialOption) {
        specialLabels.push(specialOption.label);
      } else if (isRoleToken(id)) {
        roleCount += 1;
      } else {
        memberCount += 1;
      }
    });
    const parts = [...specialLabels];
    if (roleCount > 0) parts.push(`${roleCount} 个角色`);
    if (memberCount > 0) parts.push(`${memberCount} 个成员`);
    return parts.join("、");
  };

  const initiatorSummary = getPrincipalSummary(transition.initiator_ids, "All");
  const assigneeSummary = getPrincipalSummary(transition.assignee_ids, "不约束");
  const approverSummary = getPrincipalSummary(transition.approver_ids, "无需审批");

  useEffect(() => {
    if (!showMenu) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [showMenu]);

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setShowMenu(false);
    try {
      await onDelete(transition.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const getBoxClassName = (active: boolean) =>
    cn(
      "flex h-9 w-full items-center gap-2 rounded-md border px-3 text-sm transition-colors cursor-pointer",
      active ? "border-accent-primary bg-accent-subtle/10" : "border-subtle bg-surface-1 hover:bg-surface-2"
    );

  return (
    <div
      className={cn(
        "relative rounded-md border border-subtle bg-surface-1 transition-colors",
        showMenu && "z-30"
      )}
    >
      {isEditable && (
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
                onClick={onEdit}
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
            <p className="mb-1 text-xs text-tertiary">目标状态</p>
            <button type="button" onClick={() => onViewBox("state")} className={getBoxClassName(activeViewBox === "state")}>
              {selectedToState ? (
                <>
                  <StateGroupIcon stateGroup={selectedToState.group} color={selectedToState.color} size={EIconSize.SM} />
                  <span className="flex-1 truncate text-left text-primary">{selectedToState.name}</span>
                </>
              ) : (
                <span className="flex-1 truncate text-left text-tertiary">目标状态已删除</span>
              )}
            </button>
          </div>

          <div>
            <p className="mb-1 text-xs text-tertiary">发起人</p>
            <button
              type="button"
              onClick={() => onViewBox("initiator")}
              className={getBoxClassName(activeViewBox === "initiator")}
            >
              <Users className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              <span className="flex-1 truncate text-left text-primary">{initiatorSummary}</span>
            </button>
          </div>

          <div>
            <p className="mb-1 text-xs text-tertiary">目标负责人</p>
            <button
              type="button"
              onClick={() => onViewBox("assignee")}
              className={getBoxClassName(activeViewBox === "assignee")}
            >
              <Users className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              <span className="flex-1 truncate text-left text-primary">{assigneeSummary}</span>
            </button>
          </div>

          <div>
            <p className="mb-1 text-xs text-tertiary">审批人</p>
            <button
              type="button"
              onClick={() => onViewBox("approver")}
              className={getBoxClassName(activeViewBox === "approver")}
            >
              <Users className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              <span className="flex-1 truncate text-left text-primary">{approverSummary}</span>
            </button>
          </div>

          <div>
            <p className="mb-1 text-xs text-tertiary">必填字段</p>
            <button
              type="button"
              onClick={() => onViewBox("fields")}
              className={getBoxClassName(activeViewBox === "fields")}
            >
              <Tag className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
              {transition.extra_field_ids.length === 0 ? (
                <span className="flex-1 text-left text-tertiary">无需必填</span>
              ) : (
                <span className="flex-1 truncate text-left text-primary">{transition.extra_field_ids.length} 个字段</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
