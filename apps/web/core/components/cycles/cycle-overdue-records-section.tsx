/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Disclosure, Transition } from "@headlessui/react";
import { ChevronDownIcon } from "@plane/propel/icons";
import type { ICycleOverdueRecord } from "@plane/types";
import { CycleOverdueRecordRow } from "@/components/cycles/cycle-overdue-record-row";
import { CycleService } from "@/services/cycle.service";

type Props = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};

export function CycleOverdueRecordsSection(props: Props) {
  const { workspaceSlug, projectId, cycleId } = props;
  const cycleService = useMemo(() => new CycleService(), []);

  const swrKey =
    workspaceSlug && projectId && cycleId
      ? `CYCLE_OVERDUES_${workspaceSlug}_${projectId}_${cycleId}`
      : null;

  const { data: overdues } = useSWR<ICycleOverdueRecord[]>(
    swrKey,
    swrKey ? () => cycleService.getCycleOverdues(workspaceSlug, projectId, cycleId) : null
  );

  const records = overdues ?? [];
  const activeRecord = records.find((record) => !record.ended_at) ?? null;
  const totalCount = records.length;

  return (
    <div className="flex w-full flex-col items-center justify-start gap-2 border-t border-subtle px-1.5 py-5">
      <Disclosure defaultOpen={!!activeRecord}>
        {({ open }) => (
          <div className={`relative flex h-full w-full flex-col ${open ? "" : "flex-row"}`}>
            <Disclosure.Button className="flex w-full items-center justify-between gap-2 p-1.5">
              <div className="flex items-center justify-start gap-2 text-13">
                <span className="font-medium text-secondary">延期记录</span>
                {totalCount > 0 ? (
                  <span className="rounded bg-danger-subtle px-1.5 py-0.5 text-11 font-medium text-danger-primary">
                    迭代逾期
                  </span>
                ) : (
                  <span className="text-11 text-tertiary">无</span>
                )}
              </div>
              <ChevronDownIcon className={`h-3.5 w-3.5 ${open ? "rotate-180 transform" : ""}`} aria-hidden="true" />
            </Disclosure.Button>
            <Transition show={open}>
              <Disclosure.Panel>
                <div className="mt-2 flex w-full flex-col gap-2">
                  {records.length === 0 ? (
                    <span className="px-1.5 text-11 text-tertiary">该迭代尚未产生延期记录</span>
                  ) : (
                    records.map((record) => <CycleOverdueRecordRow key={record.id} record={record} />)
                  )}
                </div>
              </Disclosure.Panel>
            </Transition>
          </div>
        )}
      </Disclosure>
    </div>
  );
}
