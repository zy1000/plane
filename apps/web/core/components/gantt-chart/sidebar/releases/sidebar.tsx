/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { GANTT_TIMELINE_TYPE } from "@plane/types";
import type { IBlockUpdateData } from "@plane/types";
import { Loader } from "@plane/ui";
import { GanttDnDHOC } from "../gantt-dnd-HOC";
import { handleOrderChange } from "../utils";
import { ReleasesSidebarBlock } from "@/components/gantt-chart/sidebar/releases/block";
import { useTimeLineChart } from "@/hooks/use-timeline-chart";

type Props = {
  title: string;
  blockUpdateHandler: (block: unknown, payload: IBlockUpdateData) => void;
  blockIds: string[];
  enableReorder: boolean;
};

export const ReleaseGanttSidebar = observer(function ReleaseGanttSidebar(props: Props) {
  const { blockUpdateHandler, blockIds, enableReorder } = props;

  const { getBlockById } = useTimeLineChart(GANTT_TIMELINE_TYPE.RELEASE);

  const handleOnDrop = (
    draggingBlockId: string | undefined,
    droppedBlockId: string | undefined,
    dropAtEndOfList: boolean
  ) => {
    handleOrderChange(draggingBlockId, droppedBlockId, dropAtEndOfList, blockIds, getBlockById, blockUpdateHandler);
  };

  return (
    <div className="h-full">
      {blockIds ? (
        blockIds.map((blockId, index) => (
          <GanttDnDHOC
            key={blockId}
            id={blockId}
            isLastChild={index === blockIds.length - 1}
            isDragEnabled={enableReorder}
            onDrop={handleOnDrop}
          >
            {(isDragging: boolean) => <ReleasesSidebarBlock blockId={blockId} isDragging={isDragging} />}
          </GanttDnDHOC>
        ))
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
