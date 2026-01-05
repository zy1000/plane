import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { observer } from "mobx-react";
import type {
  ChartDataType,
  IBlockUpdateData,
  IBlockUpdateDependencyData,
  IGanttBlock,
  TGanttViews,
} from "@plane/types";
import { cn, getDate } from "@plane/utils";
// components
import { MultipleSelectGroup } from "@/components/core/multiple-select";
import { GanttChartSidebar, MonthChartView, QuarterChartView, WeekChartView } from "@/components/gantt-chart";
// helpers
// hooks
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
// plane web components
import {
  TimelineDependencyPaths,
  TimelineDraggablePath,
  GanttAdditionalLayers,
} from "@/plane-web/components/gantt-chart";
import { GanttChartRowList } from "@/plane-web/components/gantt-chart/blocks/block-row-list";
import { GanttChartBlocksList } from "@/plane-web/components/gantt-chart/blocks/blocks-list";
import { IssueBulkOperationsRoot } from "@/plane-web/components/issues/bulk-operations";
// plane web hooks
import { useBulkOperationStatus } from "@/plane-web/hooks/use-bulk-operation-status";
//
import { DEFAULT_BLOCK_WIDTH, GANTT_SELECT_GROUP, HEADER_HEIGHT, SIDEBAR_WIDTH } from "../constants";
import { getItemPositionWidth } from "../views";
import { TimelineDragHelper } from "./timeline-drag-helper";

const SIDEBAR_MIN_WIDTH = 260;
const SIDEBAR_MAX_WIDTH = 560;
const CHART_MIN_WIDTH = 360;
// 甘特图文件
type Props = {
  blockIds: string[];
  canLoadMoreBlocks?: boolean;
  loadMoreBlocks?: () => void;
  updateBlockDates?: (updates: IBlockUpdateDependencyData[]) => Promise<void>;
  blockToRender: (data: any) => React.ReactNode;
  blockUpdateHandler: (block: any, payload: IBlockUpdateData) => void;
  bottomSpacing: boolean;
  enableBlockLeftResize: boolean | ((blockId: string) => boolean);
  enableBlockMove: boolean | ((blockId: string) => boolean);
  enableBlockRightResize: boolean | ((blockId: string) => boolean);
  enableReorder: boolean | ((blockId: string) => boolean);
  enableSelection: boolean | ((blockId: string) => boolean);
  enableAddBlock: boolean | ((blockId: string) => boolean);
  enableDependency: boolean | ((blockId: string) => boolean);
  itemsContainerWidth: number;
  showAllBlocks: boolean;
  sidebarToRender: (props: any) => React.ReactNode;
  title: string;
  updateCurrentViewRenderPayload: (
    direction: "left" | "right",
    currentView: TGanttViews,
    targetDate?: Date
  ) => ChartDataType | undefined;
  quickAdd?: React.ReactNode | undefined;
  isEpic?: boolean;
};

export const GanttChartMainContent = observer(function GanttChartMainContent(props: Props) {
  const {
    blockIds,
    loadMoreBlocks,
    blockToRender,
    blockUpdateHandler,
    bottomSpacing,
    enableBlockLeftResize,
    enableBlockMove,
    enableBlockRightResize,
    enableReorder,
    enableAddBlock,
    enableSelection,
    enableDependency,
    itemsContainerWidth,
    showAllBlocks,
    sidebarToRender,
    title,
    canLoadMoreBlocks,
    updateCurrentViewRenderPayload,
    quickAdd,
    updateBlockDates,
    isEpic = false,
  } = props;
  // refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const sidebarContainerRef = useRef<HTMLDivElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const scrollSyncLockRef = useRef<"sidebar" | "chart" | null>(null);
  const boundaryIdleTimerRef = useRef<number | null>(null);
  const pendingBoundaryRef = useRef<"left" | "right" | null>(null);
  const ignoreBoundaryUntilRef = useRef<number>(0);
  const resizeStartRef = useRef<{ clientX: number; sidebarWidth: number; maxWidth: number } | null>(null);
  const panStartRef = useRef<{ clientX: number; clientY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const panActiveRef = useRef(false);
  const panButtonRef = useRef<0 | 2 | null>(null);
  const suppressContextMenuUntilRef = useRef<number>(0);

  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_WIDTH);
  // chart hook
  const { currentView, currentViewData } = useTimeLineChartStore();
  // plane web hooks
  const isBulkOperationsEnabled = useBulkOperationStatus();

  const maxSidebarWidth = (() => {
    const containerWidth = splitContainerRef.current?.getBoundingClientRect().width;
    if (!containerWidth) return SIDEBAR_MAX_WIDTH;
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, containerWidth - CHART_MIN_WIDTH));
  })();

  const effectiveSidebarWidth = Math.min(Math.max(sidebarWidth, SIDEBAR_MIN_WIDTH), maxSidebarWidth);

  // Enable Auto Scroll for sidebar list reorder
  useEffect(() => {
    const element = sidebarContainerRef.current;

    if (!element) return;

    return combine(
      autoScrollForElements({
        element,
        getAllowedAxis: () => "vertical",
        canScroll: ({ source }) => source.data.dragInstanceId === "GANTT_REORDER",
      })
    );
  }, [sidebarContainerRef?.current]);

  useEffect(() => {
    return () => {
      if (boundaryIdleTimerRef.current) window.clearTimeout(boundaryIdleTimerRef.current);
    };
  }, []);

  // handling scroll functionality
  const syncScrollFromChart = (scrollTop: number) => {
    if (!sidebarContainerRef.current) return;
    if (scrollSyncLockRef.current === "sidebar") return;
    scrollSyncLockRef.current = "chart";
    sidebarContainerRef.current.scrollTop = scrollTop;
    requestAnimationFrame(() => {
      if (scrollSyncLockRef.current === "chart") scrollSyncLockRef.current = null;
    });
  };

  const syncScrollFromSidebar = (scrollTop: number) => {
    if (!chartContainerRef.current) return;
    if (scrollSyncLockRef.current === "chart") return;
    scrollSyncLockRef.current = "sidebar";
    chartContainerRef.current.scrollTop = scrollTop;
    requestAnimationFrame(() => {
      if (scrollSyncLockRef.current === "sidebar") scrollSyncLockRef.current = null;
    });
  };

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      panStartRef.current = null;
      panActiveRef.current = false;
      panButtonRef.current = null;
    };
  }, []);

  const startPan = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (e.button !== 0 && e.button !== 2) return;
    if (!chartContainerRef.current) return;
    if (resizeStartRef.current) return;

    const target = e.target as HTMLElement | null;
    const allowPanFromTarget = !!target?.closest('[data-allow-pan="true"]');
    if (target?.closest('[id^="gantt-block-"]')) return;
    if (
      !allowPanFromTarget &&
      target?.closest('a,button,input,textarea,select,option,[role="button"],[contenteditable="true"],[data-no-pan="true"]')
    )
      return;

    const active = document.activeElement as HTMLElement | null;
    if (active?.blur) active.blur();

    panStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      scrollLeft: chartContainerRef.current.scrollLeft,
      scrollTop: chartContainerRef.current.scrollTop,
    };
    panActiveRef.current = false;
    panButtonRef.current = e.button;

    const onMouseMove = (ev: MouseEvent) => {
      const start = panStartRef.current;
      const el = chartContainerRef.current;
      if (!start || !el) return;

      const dx = ev.clientX - start.clientX;
      const dy = ev.clientY - start.clientY;

      if (!panActiveRef.current) {
        const threshold = 3;
        if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
        panActiveRef.current = true;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }

      el.scrollLeft = start.scrollLeft - dx;
      el.scrollTop = start.scrollTop - dy;
      ev.preventDefault();
    };

    const onMouseUp = () => {
      const wasPanning = panActiveRef.current;
      const button = panButtonRef.current;
      panStartRef.current = null;
      panActiveRef.current = false;
      panButtonRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (button === 2 && wasPanning) suppressContextMenuUntilRef.current = Date.now() + 1000;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: false });
    window.addEventListener("mouseup", onMouseUp);
  };

  const onChartScroll = (e: React.UIEvent<HTMLDivElement, UIEvent>) => {
    const { clientWidth, scrollLeft, scrollWidth } = e.currentTarget;

    syncScrollFromChart(e.currentTarget.scrollTop);

    if (Date.now() < ignoreBoundaryUntilRef.current) return;

    const EDGE_THRESHOLD = 8;
    const approxRangeLeft = scrollLeft;
    const approxRangeRight = scrollWidth - (scrollLeft + clientWidth);
    const calculatedRangeRight = itemsContainerWidth - (scrollLeft + clientWidth);
    const remainingRight = Math.min(approxRangeRight, calculatedRangeRight);

    const shouldExpandRight = remainingRight <= EDGE_THRESHOLD;
    const shouldExpandLeft = approxRangeLeft <= EDGE_THRESHOLD;
    const pendingSide: "left" | "right" | null = shouldExpandRight ? "right" : shouldExpandLeft ? "left" : null;

    if (!pendingSide) {
      pendingBoundaryRef.current = null;
      if (boundaryIdleTimerRef.current) {
        window.clearTimeout(boundaryIdleTimerRef.current);
        boundaryIdleTimerRef.current = null;
      }
      return;
    }

    pendingBoundaryRef.current = pendingSide;
    if (boundaryIdleTimerRef.current) window.clearTimeout(boundaryIdleTimerRef.current);
    boundaryIdleTimerRef.current = window.setTimeout(() => {
      const el = chartContainerRef.current;
      const side = pendingBoundaryRef.current;
      if (!el || !side) return;

      const { clientWidth, scrollLeft, scrollWidth } = el;
      const approxRangeLeft = scrollLeft;
      const approxRangeRight = scrollWidth - (scrollLeft + clientWidth);
      const calculatedRangeRight = itemsContainerWidth - (scrollLeft + clientWidth);
      const remainingRight = Math.min(approxRangeRight, calculatedRangeRight);

      const stillAtLeftEdge = approxRangeLeft <= EDGE_THRESHOLD;
      const stillAtRightEdge = remainingRight <= EDGE_THRESHOLD;
      const shouldExpand = side === "left" ? stillAtLeftEdge : stillAtRightEdge;
      if (!shouldExpand) return;

      ignoreBoundaryUntilRef.current = Date.now() + 150;
      updateCurrentViewRenderPayload(side, currentView);
    }, 120);

  };

  const handleScrollToBlock = (block: IGanttBlock) => {
    const scrollContainer = chartContainerRef.current as HTMLDivElement;
    const scrollToEndDate = !block.start_date && block.target_date;
    const scrollToDate = block.start_date ? getDate(block.start_date) : getDate(block.target_date);
    let chartData;

    if (!scrollContainer || !currentViewData || !scrollToDate) return;

    if (scrollToDate.getTime() < currentViewData.data.startDate.getTime()) {
      chartData = updateCurrentViewRenderPayload("left", currentView, scrollToDate);
    } else if (scrollToDate.getTime() > currentViewData.data.endDate.getTime()) {
      chartData = updateCurrentViewRenderPayload("right", currentView, scrollToDate);
    }
    // update container's scroll position to the block's position
    const updatedPosition = getItemPositionWidth(chartData ?? currentViewData, block);

    setTimeout(() => {
      if (updatedPosition)
        scrollContainer.scrollLeft = updatedPosition.marginLeft - 4 - (scrollToEndDate ? DEFAULT_BLOCK_WIDTH : 0);
    });
  };

  const startResize = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (e.button !== 0) return;
    const containerWidth = splitContainerRef.current?.getBoundingClientRect().width;
    const maxWidth = containerWidth ? Math.min(SIDEBAR_MAX_WIDTH, containerWidth - CHART_MIN_WIDTH) : SIDEBAR_MAX_WIDTH;

    resizeStartRef.current = {
      clientX: e.clientX,
      sidebarWidth,
      maxWidth,
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const { clientX, sidebarWidth: startWidth, maxWidth } = resizeStartRef.current;
      const delta = e.clientX - clientX;
      const nextWidth = Math.min(Math.max(startWidth + delta, SIDEBAR_MIN_WIDTH), Math.max(SIDEBAR_MIN_WIDTH, maxWidth));
      setSidebarWidth(nextWidth);
    };

    const onMouseUp = () => {
      if (!resizeStartRef.current) return;
      resizeStartRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const CHART_VIEW_COMPONENTS: {
    [key in TGanttViews]: React.FC;
  } = {
    week: WeekChartView,
    month: MonthChartView,
    quarter: QuarterChartView,
  };

  if (!currentView) return null;
  const ActiveChartView = CHART_VIEW_COMPONENTS[currentView];

  return (
    <>
      <TimelineDragHelper ganttContainerRef={chartContainerRef} />
      <MultipleSelectGroup
        containerRef={chartContainerRef}
        entities={{
          [GANTT_SELECT_GROUP]: blockIds ?? [],
        }}
        disabled={!isBulkOperationsEnabled || isEpic}
      >
        {(helpers) => (
          <>
            <div
              className={cn("h-full w-full flex border-t-[0.5px] border-custom-border-200", {
                "mb-8": bottomSpacing,
              })}
              ref={splitContainerRef}
            >
              <div
                className="h-full flex-shrink-0 overflow-auto vertical-scrollbar horizontal-scrollbar scrollbar-lg"
                ref={sidebarContainerRef}
                style={{
                  width: `${effectiveSidebarWidth}px`,
                }}
                onScroll={(e) => syncScrollFromSidebar(e.currentTarget.scrollTop)}
              >
                <GanttChartSidebar
                  blockIds={blockIds}
                  loadMoreBlocks={loadMoreBlocks}
                  canLoadMoreBlocks={canLoadMoreBlocks}
                  sidebarContainerRef={sidebarContainerRef}
                  blockUpdateHandler={blockUpdateHandler}
                  enableReorder={enableReorder}
                  enableSelection={enableSelection}
                  sidebarToRender={sidebarToRender}
                  title={title}
                  quickAdd={quickAdd}
                  selectionHelpers={helpers}
                  showAllBlocks={showAllBlocks}
                  isEpic={isEpic}
                />
              </div>
              <div
                className="flex-shrink-0 w-1 bg-custom-border-200 hover:bg-custom-border-300 cursor-col-resize"
                role="separator"
                aria-orientation="vertical"
                onMouseDown={startResize}
              />
              <div className="relative min-w-0 flex-grow">
                <div
                  // DO NOT REMOVE THE ID
                  id="gantt-container"
                  className="h-full w-full overflow-auto vertical-scrollbar horizontal-scrollbar scrollbar-lg"
                  ref={chartContainerRef}
                  tabIndex={-1}
                  onScroll={onChartScroll}
                  onMouseDown={startPan}
                  onContextMenu={(e) => {
                    if (panActiveRef.current || Date.now() < suppressContextMenuUntilRef.current) e.preventDefault();
                  }}
                >
                  <div className="relative min-h-full h-max flex-shrink-0 flex-grow">
                    <ActiveChartView />
                    {currentViewData && (
                      <div
                        className="relative h-full"
                        style={{
                          width: `${itemsContainerWidth}px`,
                          transform: `translateY(${HEADER_HEIGHT}px)`,
                          paddingBottom: `${HEADER_HEIGHT}px`,
                        }}
                      >
                        <GanttChartRowList
                          blockIds={blockIds}
                          blockUpdateHandler={blockUpdateHandler}
                          handleScrollToBlock={handleScrollToBlock}
                          enableAddBlock={enableAddBlock}
                          showAllBlocks={showAllBlocks}
                          selectionHelpers={helpers}
                          ganttContainerRef={chartContainerRef}
                        />
                        <TimelineDependencyPaths isEpic={isEpic} />
                        <TimelineDraggablePath />
                        <GanttAdditionalLayers itemsContainerWidth={itemsContainerWidth} blockCount={blockIds.length} />
                        <GanttChartBlocksList
                          blockIds={blockIds}
                          blockToRender={blockToRender}
                          enableBlockLeftResize={enableBlockLeftResize}
                          enableBlockRightResize={enableBlockRightResize}
                          enableBlockMove={enableBlockMove}
                          ganttContainerRef={chartContainerRef}
                          enableDependency={enableDependency}
                          showAllBlocks={showAllBlocks}
                          updateBlockDates={updateBlockDates}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <IssueBulkOperationsRoot selectionHelpers={helpers} />
          </>
        )}
      </MultipleSelectGroup>
    </>
  );
});
