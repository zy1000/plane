import type { RefObject } from "react";
import { observer } from "mobx-react";
// hooks
import { useAutoScroller } from "@/hooks/use-auto-scroller";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
//
import { HEADER_HEIGHT } from "../constants";

type Props = {
  ganttContainerRef: RefObject<HTMLDivElement>;
};
export const TimelineDragHelper = observer(function TimelineDragHelper(props: Props) {
  const { ganttContainerRef } = props;
  const { isDragging } = useTimeLineChartStore();

  useAutoScroller(ganttContainerRef, isDragging, 0, HEADER_HEIGHT);
  return <></>;
});
