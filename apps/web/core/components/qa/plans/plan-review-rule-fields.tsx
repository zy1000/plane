/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { InputNumber, Radio } from "antd";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import type { TPlanReviewApprovalType } from "@/services/qa/plan.service";

type TPlanReviewRuleFieldsProps = {
  projectId?: string;
  reviewerIds: string[];
  approvalType: TPlanReviewApprovalType;
  requiredCount: number;
  onReviewerIdsChange: (ids: string[]) => void;
  onApprovalTypeChange: (type: TPlanReviewApprovalType) => void;
  onRequiredCountChange: (count: number) => void;
};

/**
 * 计划弹窗里的「复核人 + 通过规则」。
 *
 * 规则区只在选了 2 人及以上时出现：单人复核没有「全部 / N 人」之分。
 */
export const PlanReviewRuleFields = ({
  projectId,
  reviewerIds,
  approvalType,
  requiredCount,
  onReviewerIdsChange,
  onApprovalTypeChange,
  onRequiredCountChange,
}: TPlanReviewRuleFieldsProps) => {
  const isMultiReviewer = reviewerIds.length >= 2;

  return (
    <>
      <div className="col-span-1">
        <label className="text-sm text-secondary mb-1 block">复核人</label>
        <div className="w-[320px]">
          <MemberDropdown
            multiple
            projectId={projectId}
            value={reviewerIds}
            onChange={(value) => onReviewerIdsChange(Array.isArray(value) ? value.map(String) : [])}
            placeholder="请选择复核人"
            buttonVariant="border-with-text"
            buttonContainerClassName="w-full"
            buttonClassName="h-[38px] w-full rounded border-[0.5px] border-subtle-1 px-3 text-sm"
            showUserDetails
            optionsClassName="z-[60]"
          />
        </div>
      </div>

      {isMultiReviewer && (
        <div className="col-span-1">
          <label className="text-sm text-secondary mb-1 block">通过规则</label>
          <Radio.Group
            value={approvalType}
            onChange={(event) => onApprovalTypeChange(event.target.value)}
            className="flex flex-col gap-1.5"
          >
            <Radio value="all">全部通过</Radio>
            <Radio value="n_of_m">
              <span className="inline-flex items-center gap-1.5">
                至少
                <InputNumber
                  size="small"
                  min={1}
                  max={reviewerIds.length}
                  value={requiredCount}
                  disabled={approvalType !== "n_of_m"}
                  onChange={(value) => onRequiredCountChange(Number(value) || 1)}
                  className="!w-16"
                  onClick={(event) => event.stopPropagation()}
                />
                <span className="text-secondary">/ {reviewerIds.length} 人通过</span>
              </span>
            </Radio>
          </Radio.Group>
          <div className="mt-1.5 text-xs text-tertiary">任一复核人给出「不通过」，该用例即为不通过。</div>
        </div>
      )}
    </>
  );
};
