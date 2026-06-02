/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useState } from "react";
import type { ICycle } from "@plane/types";
import { CycleOverdueRecordsModal } from "@/components/cycles/cycle-overdue-records-modal";

type Props = {
  cycleDetails: Pick<ICycle, "has_active_overdue" | "has_overdue_history">;
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};

/**
 * 迭代列表上的延期标签：
 * - 只要存在延期记录（当前或历史）：红色「迭代逾期」
 *
 * 点击标签弹出逾期记录弹窗。
 */
export function CycleOverdueTag(props: Props) {
  const { cycleDetails, workspaceSlug, projectId, cycleId } = props;
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!cycleDetails.has_active_overdue && !cycleDetails.has_overdue_history) return null;

  const openModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsModalOpen(true);
  };

  const stopBubble = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <span className="flex items-center" onClick={stopBubble}>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex flex-shrink-0 items-center rounded-full border border-danger-subtle bg-danger-subtle px-1.5 py-0.5 text-[10px] font-medium text-danger-primary transition-opacity hover:opacity-80"
      >
        迭代逾期
      </button>
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
