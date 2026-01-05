import type { RefObject } from "react";
import { useState } from "react";
import { observer } from "mobx-react";
// ui
import { GANTT_TIMELINE_TYPE } from "@plane/types";
import type { IBlockUpdateData } from "@plane/types";
import { Loader } from "@plane/ui";
// components
import RenderIfVisible from "@/components/core/render-if-visible-HOC";
import { GanttLayoutListItemLoader } from "@/components/ui/loader/layouts/gantt-layout-loader";
//hooks
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
// local imports
import { useTimeLineChart } from "../../../../hooks/use-timeline-chart";
import { GanttDnDHOC } from "../gantt-dnd-HOC";
import { handleOrderChange } from "../utils";
import { IssuesSidebarBlock } from "./block";

type Props = {
  blockUpdateHandler: (block: any, payload: IBlockUpdateData) => void;
  canLoadMoreBlocks?: boolean;
  loadMoreBlocks?: () => void;
  ganttContainerRef: RefObject<HTMLDivElement>;
  blockIds: string[];
  rootBlockIds: string[];
  enableReorder: boolean;
  enableSelection: boolean;
  showAllBlocks?: boolean;
  selectionHelpers?: TSelectionHelper;
  isEpic?: boolean;
  expandedIssueIds: Set<string>;
  nestingLevelById: Record<string, number>;
  onToggleExpand: (issueId: string) => void;
};

export const IssueGanttSidebar = observer(function IssueGanttSidebar(props: Props) {
  const {
    blockUpdateHandler,
    blockIds,
    rootBlockIds,
    enableReorder,
    enableSelection,
    loadMoreBlocks,
    canLoadMoreBlocks,
    ganttContainerRef,
    showAllBlocks = false,
    selectionHelpers,
    isEpic = false,
    expandedIssueIds,
    nestingLevelById,
    onToggleExpand,
  } = props;

  const { getBlockById } = useTimeLineChart(GANTT_TIMELINE_TYPE.ISSUE);

  const {
    issues: { getIssueLoader },
  } = useIssuesStore();

  const [intersectionElement, setIntersectionElement] = useState<HTMLDivElement | null>(null);

  const isPaginating = !!getIssueLoader();

  useIntersectionObserver(
    ganttContainerRef,
    isPaginating ? null : intersectionElement,
    loadMoreBlocks,
    "100% 0% 100% 0%"
  );

  const handleOnDrop = (
    draggingBlockId: string | undefined,
    droppedBlockId: string | undefined,
    dropAtEndOfList: boolean
  ) => {
    handleOrderChange(
      draggingBlockId,
      droppedBlockId,
      dropAtEndOfList,
      rootBlockIds,
      getBlockById,
      blockUpdateHandler
    );
  };

  const lastRootBlockId = rootBlockIds[rootBlockIds.length - 1];

  return (
    <div>
      {blockIds ? (
        <>
          {blockIds.map((blockId, index) => {
            const block = getBlockById(blockId);
            const isBlockVisibleOnSidebar = block?.start_date && block?.target_date;
            const nestingLevel = nestingLevelById[blockId] ?? 0;
            const isExpanded = expandedIssueIds.has(blockId);

            // hide the block if it doesn't have start and target dates and showAllBlocks is false
            if (!block || (!showAllBlocks && !isBlockVisibleOnSidebar)) return;

            const blockContent = (isDragging: boolean) => (
              <IssuesSidebarBlock
                block={block}
                enableSelection={enableSelection}
                isDragging={isDragging}
                selectionHelpers={selectionHelpers}
                isEpic={isEpic}
                nestingLevel={nestingLevel}
                isExpanded={isExpanded}
                onToggleExpand={onToggleExpand}
              />
            );

            return (
              <RenderIfVisible
                key={block.id}
                root={ganttContainerRef}
                horizontalOffset={100}
                verticalOffset={200}
                shouldRecordHeights={false}
                placeholderChildren={<GanttLayoutListItemLoader />}
              >
                {nestingLevel === 0 ? (
                  <GanttDnDHOC
                    id={block.id}
                    isLastChild={block.id === lastRootBlockId}
                    isDragEnabled={enableReorder}
                    onDrop={handleOnDrop}
                  >
                    {blockContent}
                  </GanttDnDHOC>
                ) : (
                  blockContent(false)
                )}
              </RenderIfVisible>
            );
          })}
          {canLoadMoreBlocks && (
            <div ref={setIntersectionElement} className="p-2">
              <div className="flex h-10 md:h-8 w-full items-center justify-between gap-1.5 rounded md:px-1 px-4 py-1.5 bg-custom-background-80 animate-pulse" />
            </div>
          )}
        </>
      ) : (
        <Loader className="space-y-3 pr-2">
          <Loader.Item height="34px" />
          <Loader.Item height="34px" />
          <Loader.Item height="34px" />
          <Loader.Item height="34px" />
        </Loader>
      )}
    </div>
  );
});
