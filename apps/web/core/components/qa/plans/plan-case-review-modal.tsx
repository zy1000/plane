/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TPlanCaseReviewResult } from "@/services/qa/plan.service";
import { PlanCaseResultTag } from "./plan-case-tags";
import { PlanCaseReviewProgress, usePlanCaseReviewRecords } from "./plan-case-review-records";
import type { TPlanCaseReviewTarget } from "./use-plan-case-review";

type TPlanCaseReviewModalProps = {
  open: boolean;
  targets: TPlanCaseReviewTarget[];
  skippedCount: number;
  submitting: boolean;
  workspaceSlug?: string;
  resultColors?: Record<string | number, string>;
  /** 计划的复核人 id 列表，用于展示复核进度 */
  reviewerIds?: string[];
  /** 计划的通过规则文案，如「至少 2 人通过」 */
  reviewRuleLabel?: string;
  currentUserId?: string;
  onClose: () => void;
  onSubmit: (payload: { result: TPlanCaseReviewResult; reason?: string }) => void;
};

const CONCLUSION_OPTIONS: { value: TPlanCaseReviewResult; title: string; description: string }[] = [
  { value: "通过", title: "通过", description: "执行结果可信，计入通过率" },
  { value: "不通过", title: "不通过", description: "需说明原因，用例退回重新执行" },
];

export const PlanCaseReviewModal = ({
  open,
  targets,
  skippedCount,
  submitting,
  workspaceSlug,
  resultColors,
  reviewerIds = [],
  reviewRuleLabel,
  currentUserId,
  onClose,
  onSubmit,
}: TPlanCaseReviewModalProps) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<TPlanCaseReviewResult>("通过");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();

  const count = targets.length;
  const isSingle = count === 1;
  const { records } = usePlanCaseReviewRecords(workspaceSlug, isSingle && open ? targets[0]?.id : null);

  // 每次打开都回到默认结论，避免带上一次的原因
  useEffect(() => {
    if (open) {
      setResult("通过");
      setReason("");
      setReasonError(undefined);
    }
  }, [open]);

  const handleConfirm = () => {
    if (result === "不通过" && !reason.trim()) {
      setReasonError("复核不通过时必须填写原因");
      return;
    }
    onSubmit({ result, reason: reason.trim() || undefined });
  };

  const headerHint =
    reviewerIds.length > 1
      ? `本计划需${reviewRuleLabel || `${reviewerIds.length} 位复核人通过`}；任一人不通过即为不通过`
      : `将复核 ${count} 条用例的执行结果`;

  return (
    <ModalCore
      isOpen={open}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XL}
      initialFocus={bodyRef}
    >
      <div className="flex w-full flex-col text-primary">
        {/* Header */}
        <div className="flex items-start gap-3.5 px-6 pt-5 pb-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-accent-subtle bg-accent-subtle text-accent-primary">
            <ShieldCheck className="size-[18px]" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-base leading-tight font-semibold text-primary">复核执行结果</h3>
            <p className="mt-1 text-13 leading-snug text-tertiary tabular-nums">{headerHint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="-mt-0.5 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-layer-1 hover:text-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div
          ref={bodyRef}
          tabIndex={-1}
          className="vertical-scrollbar scrollbar-sm flex max-h-[60vh] flex-col gap-5 overflow-y-auto border-t border-subtle px-6 pt-5 pb-1 outline-none"
        >
          {isSingle ? (
            <div className="flex items-center gap-3 rounded-lg border border-subtle bg-layer-1 px-3 py-2.5">
              {targets[0]?.code && (
                <span className="shrink-0 text-12 text-secondary tabular-nums">{targets[0].code}</span>
              )}
              <span className="min-w-0 flex-1 truncate text-13 font-medium text-primary">
                {targets[0]?.name || targets[0]?.id}
              </span>
              <PlanCaseResultTag value={targets[0]?.result} colors={resultColors} />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-subtle bg-layer-1 px-3 py-2.5 text-13">
              <span className="font-medium text-primary tabular-nums">{count} 条用例</span>
              <span className="text-tertiary">该结论与原因将应用到选中的全部用例</span>
              {skippedCount > 0 && (
                <span className="ml-auto shrink-0 text-12 text-tertiary tabular-nums">
                  已跳过 {skippedCount} 条未执行
                </span>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-13 font-medium text-primary">
              复核结论<span className="ml-0.5 text-danger-primary">*</span>
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              {CONCLUSION_OPTIONS.map((option) => {
                const isActive = result === option.value;
                const isReject = option.value === "不通过";
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setResult(option.value);
                      setReasonError(undefined);
                    }}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-left transition-colors",
                      isActive
                        ? isReject
                          ? "border-danger-strong bg-danger-subtle"
                          : "border-accent-strong bg-accent-subtle"
                        : "border-subtle hover:bg-layer-1"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 size-4 shrink-0 rounded-full border-[1.5px] transition-colors",
                        isActive
                          ? isReject
                            ? "border-[5px] border-danger-primary bg-surface-1"
                            : "border-[5px] border-accent-primary bg-surface-1"
                          : "border-strong"
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-primary">{option.title}</span>
                      <span className="block text-12 text-tertiary">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-13 font-medium text-primary">
              复核原因
              <span className="ml-1.5 text-12 font-normal text-tertiary">
                {result === "不通过" ? "必填" : "可选，选「不通过」时必填"}
              </span>
            </span>
            <textarea
              rows={4}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (event.target.value.trim()) setReasonError(undefined);
              }}
              placeholder="补充复核说明"
              className={cn(
                "w-full resize-none rounded-lg border border-strong bg-surface-1 px-3 py-2.5 text-13 text-primary outline-none transition-colors placeholder:text-placeholder focus:border-accent-strong",
                reasonError && "border-danger-strong"
              )}
            />
            {reasonError && <span className="text-12 text-danger-primary">{reasonError}</span>}
          </div>

          {isSingle && reviewerIds.length > 0 && (
            <PlanCaseReviewProgress reviewerIds={reviewerIds} records={records} currentUserId={currentUserId} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 pt-4 pb-5">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button variant="primary" size="lg" loading={submitting} onClick={handleConfirm}>
            提交复核
            {count > 1 && (
              <span className="ml-0.5 rounded bg-white/20 px-1.5 py-px text-xs font-semibold tabular-nums">{count}</span>
            )}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
