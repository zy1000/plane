/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useCallback, useState } from "react";
import type { TPlanReviewApprovalType } from "@/services/qa/plan.service";

/** n_of_m 的合法区间是 1..复核人数；没人时按 1 兜底，选上人再校正 */
const clampRequiredCount = (count: number, reviewerCount: number) =>
  Math.min(Math.max(count, 1), reviewerCount || 1);

/** 历史计划可能还存着已下线的 any 规则，按等价的「至少 1 人通过」读入 */
const normalizeApprovalType = (value?: string | null): TPlanReviewApprovalType =>
  value === "n_of_m" || value === "any" ? "n_of_m" : "all";

export type TPlanReviewRuleInitial = {
  reviewers?: string[] | null;
  review_approval_type?: TPlanReviewApprovalType | string | null;
  review_required_count?: number | null;
};

/**
 * 计划弹窗里「复核人 + 通过规则」的表单状态。
 *
 * 不变量：复核人不足 2 人时规则没有意义，统一按 all 提交（后端语义等价）；
 * n_of_m 的人数始终夹在 1..复核人数，避免把越界数字发给服务端。
 */
export const usePlanReviewRule = (initial?: TPlanReviewRuleInitial) => {
  const [reviewerIds, setReviewerIdsState] = useState<string[]>(
    (initial?.reviewers ?? []).map(String)
  );
  const [approvalType, setApprovalType] = useState<TPlanReviewApprovalType>(
    normalizeApprovalType(initial?.review_approval_type)
  );
  const [requiredCount, setRequiredCountState] = useState<number>(
    initial?.review_required_count ?? 1
  );

  const setReviewerIds = useCallback((ids: string[]) => {
    const next = ids.map(String);
    setReviewerIdsState(next);
    setRequiredCountState((current) => clampRequiredCount(current, next.length));
    // 少于 2 人时规则区不显示，把规则收回 all，避免留着 n_of_m 提交被服务端拒绝
    if (next.length < 2) setApprovalType("all");
  }, []);

  const setRequiredCount = useCallback(
    (count: number) => setRequiredCountState(clampRequiredCount(count, reviewerIds.length)),
    [reviewerIds.length]
  );

  const reset = useCallback((next?: TPlanReviewRuleInitial) => {
    const ids = (next?.reviewers ?? []).map(String);
    setReviewerIdsState(ids);
    setApprovalType(ids.length >= 2 ? normalizeApprovalType(next?.review_approval_type) : "all");
    setRequiredCountState(clampRequiredCount(next?.review_required_count ?? 1, ids.length));
  }, []);

  const buildPayload = useCallback(
    () => ({
      reviewers: reviewerIds,
      review_approval_type: reviewerIds.length >= 2 ? approvalType : "all",
      review_required_count:
        reviewerIds.length >= 2 && approvalType === "n_of_m" ? requiredCount : null,
    }),
    [approvalType, requiredCount, reviewerIds]
  );

  return {
    reviewerIds,
    setReviewerIds,
    approvalType,
    setApprovalType,
    requiredCount,
    setRequiredCount,
    reset,
    buildPayload,
  };
};
