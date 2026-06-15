/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useState } from "react";
import type { ICycle, TCycleOverduePhase } from "@plane/types";
import { CycleOverdueRecordsModal } from "@/components/cycles/cycle-overdue-records-modal";
import { getCycleOverduePhaseLabel } from "@/components/cycles/cycle-status-config";

type Props = {
  cycleDetails: Pick<
    ICycle,
    | "has_active_overdue"
    | "has_overdue_history"
    | "has_active_dev_overdue"
    | "has_active_test_overdue"
    | "has_dev_overdue_history"
    | "has_test_overdue_history"
    | "active_overdue_phase"
  >;
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};

type TPhaseTag = {
  phase: TCycleOverduePhase;
};

/**
 * 迭代列表/卡片上的延期标签集合。
 * - 任意阶段「曾经发生过」延期就会展示该阶段的标签，最多同时显示研发延期 + 测试延期两个。
 * - 颜色按阶段固定：研发延期红色（danger），测试延期橙色（warning）。
 * - 标签点击后弹出 CycleOverdueRecordsModal，展示该迭代的全部延期记录。
 */
export function CycleOverdueTag(props: Props) {
  const { cycleDetails, workspaceSlug, projectId, cycleId } = props;
  const [isModalOpen, setIsModalOpen] = useState(false);

  const phaseTags = getOverduePhaseTags(cycleDetails);
  if (phaseTags.length === 0) return null;

  const openModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsModalOpen(true);
  };

  const stopBubble = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <span className="flex items-center gap-2" onClick={stopBubble}>
      {phaseTags.map(({ phase }) => (
        <button
          key={phase}
          type="button"
          onClick={openModal}
          className={
            phase === "dev"
              ? "inline-flex flex-shrink-0 items-center rounded-full border border-danger-subtle bg-danger-subtle px-1.5 py-0.5 text-[10px] font-medium text-danger-primary transition-opacity hover:opacity-80"
              : "inline-flex flex-shrink-0 items-center rounded-full border border-warning-subtle bg-warning-subtle px-1.5 py-0.5 text-[10px] font-medium text-[#F59E0B] transition-opacity hover:opacity-80"
          }
        >
          {getCycleOverduePhaseLabel(phase)}
        </button>
      ))}
      <CycleOverdueRecordsModal
        isOpen={isModalOpen}
        handleClose={() => setIsModalOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
      />
    </span>
  );
}

/**
 * 计算 dev / test 各阶段是否需要展示标签。
 * - 只要 has_active_<phase>_overdue 或 has_<phase>_overdue_history 任一为 true 就展示。
 * - 保留对 active_overdue_phase 的回退兼容，防止后端尚未升级时完全不显示标签。
 */
function getOverduePhaseTags(
  cycle: Pick<
    ICycle,
    | "has_active_overdue"
    | "has_overdue_history"
    | "has_active_dev_overdue"
    | "has_active_test_overdue"
    | "has_dev_overdue_history"
    | "has_test_overdue_history"
    | "active_overdue_phase"
  >
): TPhaseTag[] {
  const tags: TPhaseTag[] = [];

  if (cycle.has_active_dev_overdue || cycle.has_dev_overdue_history) {
    tags.push({ phase: "dev" });
  }
  if (cycle.has_active_test_overdue || cycle.has_test_overdue_history) {
    tags.push({ phase: "test" });
  }

  if (tags.length === 0 && cycle.active_overdue_phase) {
    tags.push({ phase: cycle.active_overdue_phase });
  }
  return tags;
}
