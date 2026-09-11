"use client";
import React from "react";
import { observer } from "mobx-react";
import { Card, Tag, Tooltip, Badge } from "antd";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { useMember } from "@/hooks/store/use-member";
import type { ReviewCaseListItem } from "@/services/qa/review.service";

type Props = {
  item: ReviewCaseListItem;
  isActive: boolean;
  suggestionCount: number;
  resultColor: string;
  onSelect: (caseId: string, mine: ReviewCaseListItem["mine"]) => void;
};

// 单条评审用例卡片。列表量级可达千条,这里用 observer + memo 隔离重渲:
// 成员信息到达时只有用到该成员的卡片刷新,父组件的其它 state 变化不会波及未变化的卡片。
export const ReviewCaseCard: React.FC<Props> = observer((props) => {
  const { item, isActive, suggestionCount, resultColor, onSelect } = props;
  const { getUserDetails } = useMember();

  const caseId = String(item.case_id ?? item.id);
  const showBadge = suggestionCount > 0;
  const reviewerCount = Math.max(Number(item.reviewer_count || 0), 0);
  const safeReviewedCount = Math.min(Math.max(Number(item.reviewed_count || 0), 0), reviewerCount);
  const pendingCount = reviewerCount - safeReviewedCount;
  const progressPercent = reviewerCount > 0 ? Math.round((safeReviewedCount / reviewerCount) * 100) : 0;
  // 服务端只下发前几个待评审人用来出头像,超出的部分用数字补
  const pendingAvatarIds = (Array.isArray(item.pending_assignees) ? item.pending_assignees : [])
    .map((assigneeId) => String(assigneeId || ""))
    .filter((id) => Boolean(id));
  const extraPendingCount = Math.max(pendingCount - pendingAvatarIds.length, 0);
  const pendingNames = pendingAvatarIds
    .map((assigneeId) => getUserDetails(assigneeId)?.display_name || "未知用户")
    .join("、");
  const pendingTooltip =
    pendingCount > 0
      ? `待评审：${pendingNames || "成员信息加载中"}${extraPendingCount > 0 ? ` 等 ${pendingCount} 人` : ""}`
      : "";

  return (
    <Card
      data-case-id={caseId}
      bordered
      hoverable
      onClick={() => onSelect(caseId, item.mine)}
      className={`${isActive ? "ring-2 ring-accent-strong" : ""} rounded-md hover:shadow-sm transition-shadow relative !overflow-visible`}
    >
      {showBadge && (
        <div className="absolute -top-2 -right-2 z-10">
          <Badge count={suggestionCount} style={{ backgroundColor: "#ee313b" }} />
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium truncate">{item.name}</div>
        <Tag color={resultColor}>{item.result || "-"}</Tag>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-secondary">
        {reviewerCount > 0 ? (
          <span>{`已评 ${safeReviewedCount}/${reviewerCount}`}</span>
        ) : (
          <span>未配置评审人</span>
        )}
        {reviewerCount > 0 ? <span>{progressPercent}%</span> : null}
      </div>
      {reviewerCount > 0 ? (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#f5f5f5]">
          <div
            className="h-full bg-accent-primary transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      ) : null}
      {reviewerCount > 0 ? (
        pendingCount > 0 ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <Tooltip title={pendingTooltip}>
              <div className="truncate text-xs text-[#d48806]">{`待评审 ${pendingCount} 人`}</div>
            </Tooltip>
            <div className="flex items-center gap-1">
              {pendingAvatarIds.length > 0 ? (
                <Tooltip title={pendingTooltip}>
                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <ButtonAvatars showTooltip={false} userIds={pendingAvatarIds} size="sm" />
                  </div>
                </Tooltip>
              ) : null}
              {extraPendingCount > 0 ? (
                <span className="text-xs text-[#d48806]">{`+${extraPendingCount}`}</span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-2 text-xs text-[#52c41a]">评审完成</div>
        )
      ) : null}
    </Card>
  );
});

ReviewCaseCard.displayName = "ReviewCaseCard";
