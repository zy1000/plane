"use client";
import React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ReviewCaseCard } from "./review-case-card";
import type { ReviewCaseListItem } from "@/services/qa/review.service";

type Props = {
  cases: ReviewCaseListItem[];
  selectedCaseId?: string;
  suggestionCounts: Record<string, number>;
  reviewEnums: Record<string, Record<string, { label: string; color: string }>>;
  onSelect: (caseId: string, mine: ReviewCaseListItem["mine"]) => void;
  emptyText: string;
};

const CARD_GAP = 12;
// 卡片高度会随「待评审人」一行有无而变,这里取实测常见值兜底,真实高度由 measureElement 量出来
const ESTIMATED_CARD_HEIGHT = 132;

// 评审用例列表:一次评审可挂上千条用例,全量渲染会把主线程顶死,
// 这里只渲染视口内的卡片,滚动时按需补齐。
export const ReviewCaseList: React.FC<Props> = (props) => {
  const { cases, selectedCaseId, suggestionCounts, reviewEnums, onSelect, emptyText } = props;
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: cases.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT + CARD_GAP,
    overscan: 6,
    getItemKey: (index) => String(cases[index]?.id ?? index),
  });

  // 选中用例变化时,将对应卡片滚到可见区(自动切换模式下停在切换后的位置;已可见时不滚动)
  React.useEffect(() => {
    if (!selectedCaseId) return;
    const index = cases.findIndex((item) => String(item.case_id ?? item.id) === String(selectedCaseId));
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
    // virtualizer 每次渲染都是新实例,不放进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCaseId, cases]);

  if (cases.length === 0) {
    return <div className="text-secondary py-12 text-center">{emptyText}</div>;
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto vertical-scrollbar scrollbar-sm pr-5 pl-1 pt-4 pb-2"
      style={{ scrollbarGutter: "stable" }}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = cases[virtualRow.index];
          if (!item) return null;
          const caseId = String(item.case_id ?? item.id);
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)`, paddingBottom: CARD_GAP }}
            >
              <ReviewCaseCard
                item={item}
                isActive={String(selectedCaseId || "") === caseId}
                suggestionCount={suggestionCounts[caseId] || 0}
                resultColor={reviewEnums?.CaseReviewThrough_Result?.[item.result]?.color || "default"}
                onSelect={onSelect}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
