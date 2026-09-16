import type { ReactNode } from "react";
import { EStageReviewStatus } from "@plane/types";
import { cn } from "@plane/utils";
import type { TStageReviewTimelineRail } from "@/hooks/store/use-stage-review-timeline";

/**
 * 轨道颜色跟阶段走：未评审灰、评审中琥珀、审核中蓝、已评审绿。
 * 用浅一档的 border 色，轨道是背景信息，不抢节点和文字。
 */
const RAIL_TONE: Record<EStageReviewStatus, string> = {
  [EStageReviewStatus.NOT_STARTED]: "border-subtle",
  [EStageReviewStatus.IN_REVIEW]: "border-warning-subtle",
  [EStageReviewStatus.IN_APPROVAL]: "border-accent-subtle",
  [EStageReviewStatus.COMPLETED]: "border-success-subtle",
};

/** 行在时间线上的位置：轨道两段的阶段色 + 是否首尾（首行不画上半段、尾行不画下半段） */
export type TTimelineRowPosition = { rail: TStageReviewTimelineRail; isFirst: boolean; isLast: boolean };

const railTone = (phase: EStageReviewStatus | null) => (phase ? RAIL_TONE[phase] : "border-subtle");

/**
 * 时间线上的一行：左边 28px 轨道放节点，右边正文。
 *
 * 轨道在节点圆心处断成上下两段，各自按 `phaseBefore` / `phaseAfter` 着色 —— 状态节点处两段
 * 颜色不同，轨道就在节点上换色。`nodeCenter` 是圆心离行顶的距离（行上内边距 + 半个节点），
 * 三类行的内边距不一样，所以由调用方给。
 */
export const TimelineRow = ({
  item,
  isFirst,
  isLast,
  node,
  nodeCenter,
  className,
  children,
}: {
  item: TStageReviewTimelineRail;
  isFirst: boolean;
  isLast: boolean;
  node: ReactNode;
  nodeCenter: number;
  className?: string;
  children: ReactNode;
}) => (
  <li className={cn("relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-3", className)}>
    {!isFirst && (
      <span
        aria-hidden
        className={cn("absolute top-0 left-[13px] w-0 border-l-2", railTone(item.phaseBefore))}
        style={{ height: nodeCenter }}
      />
    )}
    {!isLast && (
      <span
        aria-hidden
        className={cn("absolute bottom-0 left-[13px] w-0 border-l-2", railTone(item.phaseAfter))}
        style={{ top: nodeCenter }}
      />
    )}
    <span className="relative z-[1] grid size-7 place-items-center self-start">{node}</span>
    <div className="min-w-0">{children}</div>
  </li>
);
