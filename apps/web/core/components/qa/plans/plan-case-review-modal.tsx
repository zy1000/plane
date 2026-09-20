/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Radio } from "antd";
import { CheckCircle2, ShieldCheck, X, XCircle } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TPlanCaseReviewResult } from "@/services/qa/plan.service";
import { PlanCaseReviewRecords } from "./plan-case-review-records";
import type { TPlanCaseReviewTarget } from "./use-plan-case-review";

type TPlanCaseReviewModalProps = {
  open: boolean;
  targets: TPlanCaseReviewTarget[];
  skippedCount: number;
  submitting: boolean;
  workspaceSlug?: string;
  reviewStatusColors?: Record<string | number, string>;
  /** 计划的复核人数；多人时在记录区显示通过进度 */
  reviewerCount?: number;
  onClose: () => void;
  onSubmit: (payload: { result: TPlanCaseReviewResult; reason?: string }) => void;
};

const PREVIEW_LIMIT = 5;

export const PlanCaseReviewModal = ({
  open,
  targets,
  skippedCount,
  submitting,
  workspaceSlug,
  reviewStatusColors,
  reviewerCount,
  onClose,
  onSubmit,
}: TPlanCaseReviewModalProps) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<TPlanCaseReviewResult>("通过");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();

  // 每次打开都回到默认结论，避免带上一次的原因
  useEffect(() => {
    if (open) {
      setResult("通过");
      setReason("");
      setReasonError(undefined);
    }
  }, [open]);

  const count = targets.length;
  const isSingle = count === 1;

  const handleConfirm = () => {
    if (result === "不通过" && !reason.trim()) {
      setReasonError("复核不通过时必须填写原因");
      return;
    }
    onSubmit({ result, reason: reason.trim() || undefined });
  };

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
            <h3 className="text-base font-semibold leading-tight text-primary">复核执行结果</h3>
            <p className="mt-1 text-[13px] leading-snug text-tertiary">
              将复核 <span className="font-medium text-secondary tabular-nums">{count}</span> 条用例的执行结果
              {skippedCount > 0 && (
                <span className="text-tertiary">，已跳过 {skippedCount} 条未执行的用例</span>
              )}
            </p>
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
          className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto border-t border-subtle px-6 pt-5 pb-1 outline-none"
        >
          {count <= PREVIEW_LIMIT && (
            <ul className="flex flex-col gap-1 rounded-lg border border-subtle bg-surface-2 px-3 py-2.5">
              {targets.map((item) => (
                <li key={item.id} className="truncate text-[13px] text-secondary">
                  {item.name || item.id}
                  {item.result && <span className="ml-2 text-tertiary">{item.result}</span>}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-secondary">
              复核结论<span className="ml-0.5 text-danger-primary">*</span>
            </label>
            <Radio.Group
              value={result}
              onChange={(event) => {
                setResult(event.target.value);
                setReasonError(undefined);
              }}
            >
              <Radio value="通过">
                <span className="inline-flex items-center gap-1 text-[#52c41a]">
                  <CheckCircle2 className="size-3.5" />
                  通过
                </span>
              </Radio>
              <Radio value="不通过">
                <span className="inline-flex items-center gap-1 text-[#f5222d]">
                  <XCircle className="size-3.5" />
                  不通过
                </span>
              </Radio>
            </Radio.Group>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-secondary">
              复核原因
              {result === "不通过" && <span className="ml-0.5 text-danger-primary">*</span>}
            </label>
            <Input.TextArea
              rows={4}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (event.target.value.trim()) setReasonError(undefined);
              }}
              placeholder={result === "不通过" ? "请说明不通过的原因" : "可选，补充复核说明"}
              className={cn(reasonError && "!border-danger-strong")}
            />
            {reasonError && <span className="text-xs text-danger-primary">{reasonError}</span>}
            {!isSingle && (
              <span className="text-xs text-tertiary">该结论与原因将应用到选中的全部 {count} 条用例。</span>
            )}
            {typeof reviewerCount === "number" && reviewerCount > 1 && (
              <span className="text-xs text-tertiary">
                本计划共 {reviewerCount} 位复核人，最终状态按计划的通过规则折算；任一人不通过即为不通过。
              </span>
            )}
          </div>

          {isSingle && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-secondary">复核记录</span>
              <PlanCaseReviewRecords
                workspaceSlug={workspaceSlug}
                planCaseId={targets[0]?.id}
                colors={reviewStatusColors}
                reviewerCount={reviewerCount}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 pt-4 pb-5">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button variant="primary" loading={submitting} onClick={handleConfirm} prependIcon={<ShieldCheck />}>
            提交复核
            <span className="ml-0.5 rounded bg-white/20 px-1.5 py-px text-xs font-semibold tabular-nums">{count}</span>
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
