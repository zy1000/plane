/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@plane/utils";
import { FORM_VARIANT_STYLES, FormFieldShell } from "@/components/common/form-section";
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

const styles = FORM_VARIANT_STYLES["grouped-modal"];

/**
 * 计划弹窗里的「复核人 + 通过规则」，占分组弹窗的两列。
 *
 * 规则是分段控件「全部通过 | 至少 N 人通过」，人数步进器嵌在第二段里；
 * 只在选了 2 人及以上时出现：单人复核没有「全部 / N 人」之分。
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
  const isNofM = approvalType === "n_of_m";

  const stepButtonClass =
    "grid size-[22px] place-items-center rounded border border-subtle-1 bg-surface-1 text-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <>
      <FormFieldShell label="复核人" required editable styles={styles}>
        <div className={styles.control}>
          <MemberDropdown
            multiple
            projectId={projectId}
            value={reviewerIds}
            onChange={(value) => onReviewerIdsChange(Array.isArray(value) ? value.map(String) : [])}
            placeholder="请选择复核人"
            buttonVariant="border-with-text"
            className="h-full w-full"
            buttonContainerClassName="h-full w-full"
            buttonClassName={styles.dropdownButton}
            labelClassName={styles.dropdownLabel}
            showUserDetails
            optionsClassName="z-[60]"
          />
        </div>
      </FormFieldShell>

      {isMultiReviewer && (
        <FormFieldShell
          label="通过规则"
          required
          editable
          styles={styles}
          hint="任一复核人给出「不通过」，该用例即为不通过。"
        >
          <div
            role="radiogroup"
            className="flex h-[38px] w-fit max-w-full items-stretch gap-0.5 rounded-lg border border-subtle-1 bg-layer-1 p-[3px]"
          >
            <button
              type="button"
              role="radio"
              aria-checked={!isNofM}
              onClick={() => onApprovalTypeChange("all")}
              className={cn(
                "rounded-md px-3.5 text-13 transition-colors",
                !isNofM ? "bg-surface-1 font-medium text-primary shadow-sm" : "text-secondary hover:text-primary"
              )}
            >
              全部通过
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={isNofM}
              onClick={() => onApprovalTypeChange("n_of_m")}
              className={cn(
                "flex items-center gap-2 rounded-md px-3.5 text-13 transition-colors",
                isNofM ? "bg-surface-1 font-medium text-primary shadow-sm" : "text-secondary hover:text-primary"
              )}
            >
              至少
              <span className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="减少"
                  className={cn(stepButtonClass, requiredCount <= 1 && "pointer-events-none opacity-40")}
                  onClick={() => {
                    onApprovalTypeChange("n_of_m");
                    onRequiredCountChange(requiredCount - 1);
                  }}
                >
                  <Minus className="size-3" strokeWidth={2.5} />
                </span>
                <span className="min-w-3 text-center tabular-nums text-primary">{requiredCount}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="增加"
                  className={cn(stepButtonClass, requiredCount >= reviewerIds.length && "pointer-events-none opacity-40")}
                  onClick={() => {
                    onApprovalTypeChange("n_of_m");
                    onRequiredCountChange(requiredCount + 1);
                  }}
                >
                  <Plus className="size-3" strokeWidth={2.5} />
                </span>
              </span>
              人通过
            </button>
          </div>
        </FormFieldShell>
      )}
    </>
  );
};
