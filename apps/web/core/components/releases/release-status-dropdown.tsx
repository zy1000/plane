/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import type { IRelease, TProjectRequirement, TReleaseStatus } from "@plane/types";
import { CustomSelect } from "@plane/ui";
import { TestingDatesConfirmModal } from "@/components/common/testing-dates-confirm-modal";
import { RequirementService } from "@/services/requirement.service";
import { ReleasePublishConfirmModal } from "./release-publish-confirm-modal";
import { getAllowedReleaseStatusOptions, getReleaseStatusDetails } from "./release-status-config";
import { ReleaseStatusReasonModal } from "./release-status-reason-modal";

export type TReleaseUpdatePayload = Partial<IRelease> & { status_change_reason?: string };

type Props = {
  isDisabled: boolean;
  releaseDetails: IRelease;
  handleReleaseDetailsChange: (payload: TReleaseUpdatePayload) => Promise<void>;
};

const REASON_REQUIRED_STATUSES = new Set<TReleaseStatus>(["rejected", "cancelled"]);

// 与后端 CustomPaginator.max_page_size 一致
const PUBLISH_CHECK_PAGE_SIZE = 100;
// 软提示的兜底页数上限，防止游标异常时死循环
const PUBLISH_CHECK_MAX_PAGES = 10;

/** 按 cursor 翻页拉全量关联需求 —— 只取首页会在超过一页时漏报在途变更 */
const fetchAllReleaseRequirements = async (
  requirementService: RequirementService,
  workspaceSlug: string,
  projectId: string,
  releaseId: string
): Promise<TProjectRequirement[]> => {
  const rows: TProjectRequirement[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < PUBLISH_CHECK_MAX_PAGES; page++) {
    const response = await requirementService.listReleaseRequirements(workspaceSlug, projectId, releaseId, {
      perPage: PUBLISH_CHECK_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    rows.push(...(response?.results ?? []));
    if (!response?.next_page_results || !response?.next_cursor) break;
    cursor = response.next_cursor;
  }
  return rows;
};

export const ReleaseStatusDropdown = observer(function ReleaseStatusDropdown(props: Props) {
  const { isDisabled, releaseDetails, handleReleaseDetailsChange } = props;
  const { workspaceSlug } = useParams();
  const requirementService = useMemo(() => new RequirementService(), []);
  const releaseStatus = getReleaseStatusDetails(releaseDetails.status);
  const allowedStatusOptions = getAllowedReleaseStatusOptions(releaseDetails.status);
  const CurrentStatusIcon = releaseStatus.icon;

  const [pendingReasonStatus, setPendingReasonStatus] = useState<TReleaseStatus | null>(null);
  const [pendingDateConfirmStatus, setPendingDateConfirmStatus] = useState<TReleaseStatus | null>(null);
  // 发布软提示（第三条 pending 支路）：在途变更的关联需求列表 + 确认框开关
  const [pendingPublishConfirmStatus, setPendingPublishConfirmStatus] = useState<TReleaseStatus | null>(null);
  const [lockedRequirements, setLockedRequirements] = useState<TProjectRequirement[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // 发布前检查在飞期间锁住状态切换，避免重复触发交错
  const [isCheckingRequirements, setIsCheckingRequirements] = useState(false);

  /**
   * 发布（completed）前先查关联需求里有没有在途变更（is_locked）的行。
   * 有则弹黄色确认框列出，确认后照常提交 —— 需求永不阻塞交付域，
   * 查询失败也直接放行，软提示不能变成硬门槛。
   */
  const handlePublishAttempt = async (val: TReleaseStatus) => {
    setIsCheckingRequirements(true);
    try {
      const slug = workspaceSlug?.toString();
      let locked: TProjectRequirement[] = [];
      if (slug && releaseDetails.project_id) {
        try {
          const rows = await fetchAllReleaseRequirements(
            requirementService,
            slug,
            releaseDetails.project_id,
            releaseDetails.id
          );
          locked = rows.filter((row) => row.is_locked);
        } catch {
          // 软提示查不到就当没有，照常提交
        }
      }
      if (locked.length > 0) {
        setLockedRequirements(locked);
        setPendingPublishConfirmStatus(val);
        return;
      }
      void handleReleaseDetailsChange({ status: val });
    } finally {
      setIsCheckingRequirements(false);
    }
  };

  const handleStatusChange = (val: TReleaseStatus) => {
    // 提交/检查在飞或任一确认支路挂起时不接受新的状态切换，避免支路交错
    if (submitting || isCheckingRequirements || pendingReasonStatus || pendingDateConfirmStatus || pendingPublishConfirmStatus)
      return;
    if (val === releaseDetails.status) return;
    if (releaseDetails.status === "rejected" && val === "in-progress") {
      setPendingDateConfirmStatus(val);
      return;
    }
    if (REASON_REQUIRED_STATUSES.has(val)) {
      setPendingReasonStatus(val);
      return;
    }
    if (val === "completed") {
      void handlePublishAttempt(val);
      return;
    }
    void handleReleaseDetailsChange({ status: val });
  };

  const handlePublishConfirm = async () => {
    if (submitting) return;
    if (!pendingPublishConfirmStatus) return;
    try {
      setSubmitting(true);
      await handleReleaseDetailsChange({ status: pendingPublishConfirmStatus });
      setPendingPublishConfirmStatus(null);
      setLockedRequirements([]);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublishCancel = () => {
    if (submitting) return;
    setPendingPublishConfirmStatus(null);
    setLockedRequirements([]);
  };

  const handleReasonConfirm = async (reason: string, testHandoffDate?: string | null) => {
    if (submitting) return;
    if (!pendingReasonStatus) return;
    try {
      setSubmitting(true);
      const payload: TReleaseUpdatePayload = { status: pendingReasonStatus, status_change_reason: reason };
      if (pendingReasonStatus === "rejected" && testHandoffDate) {
        payload.test_handoff_date = testHandoffDate;
      }
      await handleReleaseDetailsChange(payload);
      setPendingReasonStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReasonCancel = () => {
    if (submitting) return;
    setPendingReasonStatus(null);
  };

  const handleTestingDatesConfirm = async (payload: { endDate: string; testHandoffDate: string }) => {
    if (submitting) return;
    if (!pendingDateConfirmStatus) return;
    try {
      setSubmitting(true);
      await handleReleaseDetailsChange({
        status: pendingDateConfirmStatus,
        target_date: payload.endDate,
        test_handoff_date: payload.testHandoffDate,
      });
      setPendingDateConfirmStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestingDatesCancel = () => {
    if (submitting) return;
    setPendingDateConfirmStatus(null);
  };

  return (
    <>
      <CustomSelect
        customButton={
          <span
            className={`flex h-6 w-20 items-center justify-center rounded-sm text-center text-11 ${
              isDisabled ? "cursor-not-allowed" : "cursor-pointer"
            }`}
            style={{
              color: releaseStatus.color,
              backgroundColor: `${releaseStatus.color}20`,
            }}
          >
            <span className="flex items-center gap-1.5">
              <CurrentStatusIcon className="h-3.5 w-3.5" />
              {releaseStatus.label}
            </span>
          </span>
        }
        value={releaseStatus?.value}
        onChange={handleStatusChange}
        disabled={isDisabled}
      >
        {allowedStatusOptions.map((status) => {
          const StatusIcon = status.icon;
          return (
            <CustomSelect.Option key={status.value} value={status.value}>
              <div className="flex items-center gap-2">
                <StatusIcon className="h-3.5 w-3.5" style={{ color: status.color }} />
                {status.label}
              </div>
            </CustomSelect.Option>
          );
        })}
      </CustomSelect>
      <ReleaseStatusReasonModal
        open={pendingReasonStatus !== null}
        nextStatus={pendingReasonStatus}
        loading={submitting}
        currentTestHandoffDate={releaseDetails.test_handoff_date ?? null}
        releaseStartDate={releaseDetails.start_date ?? null}
        releaseTargetDate={releaseDetails.target_date ?? null}
        onCancel={handleReasonCancel}
        onConfirm={handleReasonConfirm}
      />
      <TestingDatesConfirmModal
        open={pendingDateConfirmStatus !== null}
        loading={submitting}
        entityLabel="发布"
        targetStatusLabel="进行中"
        startDate={releaseDetails.start_date ?? null}
        endDate={releaseDetails.target_date ?? null}
        testHandoffDate={releaseDetails.test_handoff_date ?? null}
        onCancel={handleTestingDatesCancel}
        onConfirm={handleTestingDatesConfirm}
      />
      <ReleasePublishConfirmModal
        open={pendingPublishConfirmStatus !== null}
        loading={submitting}
        requirements={lockedRequirements}
        onCancel={handlePublishCancel}
        onConfirm={() => void handlePublishConfirm()}
      />
    </>
  );
});
