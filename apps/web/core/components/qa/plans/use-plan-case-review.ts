/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { PlanService, type TPlanCaseReviewResult } from "@/services/qa/plan.service";
import { qaCaseSetToastError, qaCaseSetToastSuccess, qaCaseSetToastWarning } from "@/utils/qa-case-error";

/** 复核对象是执行结果，未执行的用例没有可复核的内容 */
export const isPlanCaseReviewable = (result?: string | null) => Boolean(result) && result !== "未执行";

export type TPlanCaseReviewTarget = {
  id: string;
  name?: string;
  result?: string;
};

type TUsePlanCaseReviewArgs = {
  workspaceSlug?: string;
  projectId?: string;
  planId?: string | null;
  /** 复核成功后同步本地状态：statuses 是后端按通过规则折算出的 {计划用例 id: 复核状态} */
  onReviewed?: (statuses: Record<string, string>) => void;
};

/**
 * 计划用例复核的开关与提交逻辑。
 *
 * openReview 会先滤掉未执行的用例；全部不可复核时只提示、不打开弹窗。
 */
export const usePlanCaseReview = ({ workspaceSlug, projectId, planId, onReviewed }: TUsePlanCaseReviewArgs) => {
  const { t } = useTranslation();
  const planService = useRef(new PlanService()).current;
  const [isOpen, setIsOpen] = useState(false);
  const [targets, setTargets] = useState<TPlanCaseReviewTarget[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const openReview = useCallback((candidates: TPlanCaseReviewTarget[]) => {
    const reviewable = candidates.filter((item) => isPlanCaseReviewable(item.result));
    if (reviewable.length === 0) {
      qaCaseSetToastWarning("所选用例均未执行，无法复核");
      return;
    }
    setTargets(reviewable);
    setSkippedCount(candidates.length - reviewable.length);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    if (submitting) return;
    setIsOpen(false);
    setTargets([]);
    setSkippedCount(0);
  }, [submitting]);

  const submit = useCallback(
    async ({ result, reason }: { result: TPlanCaseReviewResult; reason?: string }) => {
      if (!workspaceSlug || !projectId || !planId || targets.length === 0) {
        qaCaseSetToastWarning("缺少必要参数");
        return;
      }
      setSubmitting(true);
      try {
        const response = await planService.reviewPlanCases(workspaceSlug, projectId, {
          plan_id: String(planId),
          plan_case_ids: targets.map((item) => item.id),
          result,
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
        });
        const updatedIds = response?.updated_ids ?? [];
        const skippedIds = response?.skipped_ids ?? [];
        if (updatedIds.length > 0) {
          qaCaseSetToastSuccess(
            skippedIds.length > 0
              ? `已复核 ${updatedIds.length} 条，${skippedIds.length} 条因未执行被跳过`
              : `已复核 ${updatedIds.length} 条用例`
          );
          onReviewed?.(response?.statuses ?? {});
        } else {
          qaCaseSetToastWarning("所选用例均未执行，无法复核");
        }
        setIsOpen(false);
        setTargets([]);
        setSkippedCount(0);
      } catch (error) {
        qaCaseSetToastError(error, t, "复核提交失败");
      } finally {
        setSubmitting(false);
      }
    },
    [onReviewed, planId, planService, projectId, t, targets, workspaceSlug]
  );

  return { isOpen, targets, skippedCount, submitting, openReview, close, submit };
};
