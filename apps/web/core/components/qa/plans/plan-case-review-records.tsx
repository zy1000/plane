/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spin } from "antd";
import { cn, renderFormattedDate } from "@plane/utils";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { useMember } from "@/hooks/store/use-member";
import { PlanService, type TPlanCaseReviewRecord } from "@/services/qa/plan.service";
import { PlanCaseReviewStatusTag } from "./plan-case-tags";

/** 某条计划用例的复核记录数据源 */
export const usePlanCaseReviewRecords = (workspaceSlug?: string, planCaseId?: string | null) => {
  const planService = useRef(new PlanService()).current;
  const [records, setRecords] = useState<TPlanCaseReviewRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceSlug || !planCaseId) {
      setRecords([]);
      return;
    }
    setLoading(true);
    try {
      const data = await planService.getPlanCaseReviewRecords(workspaceSlug, { plan_case_id: String(planCaseId) });
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [planCaseId, planService, workspaceSlug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { records, loading, refresh };
};

type TPlanCaseReviewRecordListProps = {
  records: TPlanCaseReviewRecord[];
  className?: string;
  colors?: Record<string | number, string>;
  /** 计划的复核人数；有值时顶部显示「已通过 x / 共 n 位复核人」 */
  reviewerCount?: number;
  /** 紧凑模式：挂在执行记录卡片下方时用更小的留白 */
  compact?: boolean;
};

/**
 * 复核记录列表（纯展示）。
 *
 * 调用方自己准备数据：计划用例维度用 PlanCaseReviewRecords 自取，
 * 执行记录维度直接用接口里随执行记录一起下发的 review_records。
 */
export const PlanCaseReviewRecordList = ({
  records,
  className,
  colors,
  reviewerCount,
  compact = false,
}: TPlanCaseReviewRecordListProps) => {
  const { getUserDetails } = useMember();

  // 进度只算未作废记录里每人的最后一票（与后端折算口径一致）
  const approvedCount = useMemo(() => {
    const lastByReviewer = new Map<string, string>();
    records.forEach((record) => {
      const reviewerId = record.reviewer ? String(record.reviewer) : "";
      if (!reviewerId || record.invalidated_at) return;
      // 记录按时间倒序返回，第一条即最后一票
      if (!lastByReviewer.has(reviewerId)) lastByReviewer.set(reviewerId, record.result);
    });
    return Array.from(lastByReviewer.values()).filter((result) => result === "通过").length;
  }, [records]);

  if (records.length === 0) {
    return <div className={cn("text-sm text-secondary", className)}>暂无复核记录</div>;
  }

  return (
    <div className={cn("flex flex-col", compact ? "gap-2" : "gap-3", className)}>
      {typeof reviewerCount === "number" && reviewerCount > 0 && (
        <div className="text-xs text-secondary">
          已通过 <span className="tabular-nums text-primary">{approvedCount}</span> / 共 {reviewerCount} 位复核人
        </div>
      )}
      {records.map((record) => {
        const reviewerId = record.reviewer ? String(record.reviewer) : null;
        const isInvalidated = Boolean(record.invalidated_at);
        const name =
          record.reviewer_detail?.display_name ||
          (reviewerId ? getUserDetails(reviewerId)?.display_name : "") ||
          "未知用户";
        const time = record.created_at ? renderFormattedDate(record.created_at, "YYYY-MM-DD HH:mm:ss") : "";
        return (
          <div
            key={String(record.id)}
            className={cn(
              "flex items-start justify-between gap-4 rounded-md",
              // 紧凑模式嵌在执行记录卡片里，与外层同色会糊成一片，改用描边区分
              compact ? "border border-subtle bg-surface-2 p-2.5" : "bg-surface-1 p-3 shadow-sm",
              isInvalidated && "opacity-60"
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              {reviewerId && (
                <div className="flex-shrink-0">
                  <ButtonAvatars showTooltip={false} userIds={reviewerId} size={compact ? "md" : "lg"} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{name}</span>
                  {isInvalidated && (
                    <span className="shrink-0 rounded-sm border border-subtle px-1 py-px text-[11px] leading-none text-tertiary">
                      已作废
                    </span>
                  )}
                </div>
                {record.reason ? (
                  <div className="whitespace-pre-wrap break-words text-sm text-secondary">{record.reason}</div>
                ) : null}
                <div className={cn("text-xs text-placeholder", compact ? "mt-1" : "mt-2")}>{time}</div>
              </div>
            </div>
            <div className="flex-shrink-0">
              <PlanCaseReviewStatusTag value={record.result} colors={colors} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

type TPlanCaseReviewRecordsProps = {
  workspaceSlug?: string;
  planCaseId?: string | null;
  className?: string;
  colors?: Record<string | number, string>;
  reviewerCount?: number;
};

/** 按计划用例自取复核记录并展示 */
export const PlanCaseReviewRecords = ({
  workspaceSlug,
  planCaseId,
  className,
  colors,
  reviewerCount,
}: TPlanCaseReviewRecordsProps) => {
  const { records, loading } = usePlanCaseReviewRecords(workspaceSlug, planCaseId);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Spin size="small" />
      </div>
    );
  }

  return (
    <PlanCaseReviewRecordList
      records={records}
      className={className}
      colors={colors}
      reviewerCount={reviewerCount}
    />
  );
};
