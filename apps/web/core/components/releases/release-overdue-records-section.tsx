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
import type { IReleaseOverdueRecord } from "@plane/types";
import { ReleaseOverdueRecordRow } from "@/components/releases/release-overdue-record-row";
import {
  getReleaseOverduePhaseLabel,
} from "@/components/releases/release-status-config";
import { ReleaseService } from "@/services/release.service";

type Props = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
};

/**
 * 发布详情侧栏的逾期记录区块。
 * 详见 docs/release-requirements.md §8 / §11。
 */
export function ReleaseOverdueRecordsSection(props: Props) {
  const { workspaceSlug, projectId, releaseId } = props;
  const releaseService = useMemo(() => new ReleaseService(), []);

  const swrKey = workspaceSlug && projectId && releaseId
    ? `RELEASE_OVERDUES_${workspaceSlug}_${projectId}_${releaseId}`
    : null;

  const { data: overdues } = useSWR<IReleaseOverdueRecord[]>(
    swrKey,
    swrKey ? () => releaseService.getReleaseOverdues(workspaceSlug, projectId, releaseId) : null
  );

  const records = overdues ?? [];
  const activeRecord = records.find((r) => !r.ended_at) ?? null;
  const totalCount = records.length;

  return (
    <div className="flex w-full flex-col items-center justify-start gap-2 border-t border-subtle px-1.5 py-5">
      <Disclosure defaultOpen={!!activeRecord}>
        {({ open }) => (
          <div className={`relative flex h-full w-full flex-col ${open ? "" : "flex-row"}`}>
            <Disclosure.Button className="flex w-full items-center justify-between gap-2 p-1.5">
              <div className="flex items-center justify-start gap-2 text-13">
                <span className="font-medium text-secondary">逾期记录</span>
                {activeRecord ? (
                  <span className="rounded bg-warning-subtle px-1.5 py-0.5 text-11 font-medium text-[#F59E0B]">
                    当前 {getReleaseOverduePhaseLabel(activeRecord.phase)}
                  </span>
                ) : totalCount > 0 ? (
                  <span className="rounded bg-danger-subtle px-1.5 py-0.5 text-11 font-medium text-danger-primary">
                    曾逾期 {totalCount} 次
                  </span>
                ) : (
                  <span className="text-11 text-tertiary">无</span>
                )}
              </div>
              <ChevronDownIcon
                className={`h-3.5 w-3.5 ${open ? "rotate-180 transform" : ""}`}
                aria-hidden="true"
              />
            </Disclosure.Button>
            <Transition show={open}>
              <Disclosure.Panel>
                <div className="mt-2 flex w-full flex-col gap-2">
                  {records.length === 0 ? (
                    <span className="px-1.5 text-11 text-tertiary">该发布尚未产生逾期记录</span>
                  ) : (
                    records.map((record) => (
                      <ReleaseOverdueRecordRow key={record.id} record={record} />
                    ))
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
