/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useState } from "react";
import type { IRelease, TReleaseOverduePhase } from "@plane/types";
import { ReleaseOverdueRecordsModal } from "@/components/releases/release-overdue-records-modal";
import { getReleaseOverduePhaseLabel } from "@/components/releases/release-status-config";

type Props = {
  releaseDetails: Pick<
    IRelease,
    | "id"
    | "has_active_dev_overdue"
    | "has_active_test_overdue"
    | "has_dev_overdue_history"
    | "has_test_overdue_history"
    | "active_overdue_phase"
  >;
  workspaceSlug: string;
  projectId: string;
};

type TPhaseTag = {
  phase: TReleaseOverduePhase;
};

/**
 * 发布行/卡片上的逾期标签集合。
 * - 任意阶段「曾经发生过」逾期就会展示该阶段的标签，最多同时显示研发逾期 + 测试逾期两个。
 * - 颜色按阶段固定：研发逾期始终为红色（danger），测试逾期始终为橙色（warning），
 *   不随「进行中 / 已完成」状态变化。
 * - 标签点击后弹出 ReleaseOverdueRecordsModal，展示该发布的全部逾期记录。
 * 详见 docs/release-requirements.md §11。
 */
export function ReleaseOverdueTags(props: Props) {
  const { releaseDetails, workspaceSlug, projectId } = props;
  const [isModalOpen, setIsModalOpen] = useState(false);

  const phaseTags = getOverduePhaseTags(releaseDetails);
  if (phaseTags.length === 0) return null;

  const openModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsModalOpen(true);
  };

  /**
   * 关键：Modal 通过 Headless UI Portal 渲染到 body，但 React 合成事件仍按
   * React 树冒泡。这里用一个 onClick 兜底层把所有从 modal 内部冒泡上来的点击
   * 事件吞掉，避免触发外层 ControlLink/Link 的路由跳转。
   */
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
          {getReleaseOverduePhaseLabel(phase)}
        </button>
      ))}
      <ReleaseOverdueRecordsModal
        isOpen={isModalOpen}
        handleClose={() => setIsModalOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        releaseId={releaseDetails.id}
      />
    </span>
  );
}

/**
 * 计算 dev / test 各阶段是否需要展示标签。
 * - 只要 has_active_<phase>_overdue 或 has_<phase>_overdue_history 任一为 true 就展示
 * - 都为 false：不渲染该阶段
 *
 * 同时保留对旧字段 active_overdue_phase 的回退兼容，
 * 防止后端尚未升级时前端完全不显示标签。
 */
function getOverduePhaseTags(
  release: Pick<
    IRelease,
    | "has_active_dev_overdue"
    | "has_active_test_overdue"
    | "has_dev_overdue_history"
    | "has_test_overdue_history"
    | "active_overdue_phase"
  >
): TPhaseTag[] {
  const tags: TPhaseTag[] = [];

  if (release.has_active_dev_overdue || release.has_dev_overdue_history) {
    tags.push({ phase: "dev" });
  }
  if (release.has_active_test_overdue || release.has_test_overdue_history) {
    tags.push({ phase: "test" });
  }

  if (tags.length === 0 && release.active_overdue_phase) {
    tags.push({ phase: release.active_overdue_phase });
  }
  return tags;
}
