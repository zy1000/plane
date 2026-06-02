/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import type { ICycleOverdueRecord } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { CycleOverdueRecordRow } from "@/components/cycles/cycle-overdue-record-row";
import { CycleService } from "@/services/cycle.service";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};
const CLOSE_ANIMATION_DURATION_MS = 200;

/**
 * 迭代逾期记录弹窗。
 * - 数据复用 sidebar 的 SWR 缓存 key（CYCLE_OVERDUES_<slug>_<project>_<cycle>）。
 * - 行渲染复用 CycleOverdueRecordRow，保持与 sidebar 一致的视觉。
 */
export function CycleOverdueRecordsModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, cycleId } = props;
  const cycleService = useMemo(() => new CycleService(), []);
  const [shouldRequestData, setShouldRequestData] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRequestData(true);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShouldRequestData(false);
    }, CLOSE_ANIMATION_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen]);

  const swrKey = shouldRequestData && workspaceSlug && projectId && cycleId
    ? `CYCLE_OVERDUES_${workspaceSlug}_${projectId}_${cycleId}`
    : null;

  const { data: overdues, isLoading } = useSWR<ICycleOverdueRecord[]>(
    swrKey,
    swrKey ? () => cycleService.getCycleOverdues(workspaceSlug, projectId, cycleId) : null
  );

  const records = overdues ?? [];
  const activeCount = records.filter((record) => !record.ended_at).length;
  const totalCount = records.length;

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXL}
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-18 font-medium 2xl:text-20">逾期记录</h3>
          {totalCount > 0 && (
            <span className="text-12 text-tertiary">
              {activeCount > 0
                ? `共 ${totalCount} 条，当前 ${activeCount} 个未结束`
                : `共 ${totalCount} 条记录`}
            </span>
          )}
        </div>

        <div className="flex max-h-[60vh] min-h-[120px] flex-col gap-2 overflow-y-auto">
          {isLoading && records.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-8 text-tertiary">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <span className="px-1.5 py-6 text-center text-12 text-tertiary">该迭代尚未产生逾期记录</span>
          ) : (
            records.map((record) => <CycleOverdueRecordRow key={record.id} record={record} />)
          )}
        </div>
      </div>
    </ModalCore>
  );
}
