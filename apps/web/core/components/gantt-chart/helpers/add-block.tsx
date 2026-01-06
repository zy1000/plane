import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { addDays } from "date-fns";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
// ui
import { Tooltip } from "@plane/propel/tooltip";
import type { IBlockUpdateData, IGanttBlock } from "@plane/types";
// helpers
import { renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
//

type Props = {
  block: IGanttBlock;
  blockUpdateHandler: (block: any, payload: IBlockUpdateData) => void;
};

export const ChartAddBlock = observer(function ChartAddBlock(props: Props) {
  const { block, blockUpdateHandler } = props;
  // states
  const [isButtonVisible, setIsButtonVisible] = useState(false);
  const [isDraggingFromButton, setIsDraggingFromButton] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [buttonXPosition, setButtonXPosition] = useState(0);
  const [buttonStartDate, setButtonStartDate] = useState<Date | null>(null);
  // refs
  const cleanupDragListenersRef = useRef<(() => void) | null>(null);
  const cleanupPointerListenersRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);
  const downPositionRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const hoverRef = useRef(false);
  const latestButtonXPositionRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  // hooks
  const { isMobile } = usePlatformOS();
  // chart hook
  const { currentViewData, currentView } = useTimeLineChartStore();

  const scheduleButtonPositionUpdate = () => {
    if (!currentViewData) return;
    if (rafIdRef.current !== null) return;

    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      const xPosition = latestButtonXPositionRef.current;
      setButtonXPosition(xPosition);

      const { startDate: chartStartDate, dayWidth } = currentViewData.data;
      const columnNumber = xPosition / dayWidth;
      setButtonStartDate(addDays(chartStartDate, columnNumber));
    });
  };

  const handleButtonClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!currentViewData) return;

    const { startDate: chartStartDate, dayWidth } = currentViewData.data;
    const columnNumber = buttonXPosition / dayWidth;

    let numberOfDays = 1;

    if (currentView === "quarter") numberOfDays = 7;

    const startDate = addDays(chartStartDate, columnNumber);
    const endDate = addDays(startDate, numberOfDays);

    blockUpdateHandler(block.data, {
      start_date: renderFormattedPayloadDate(startDate) ?? undefined,
      target_date: renderFormattedPayloadDate(endDate) ?? undefined,
      meta: block.meta,
    });
  };

  const handleButtonMouseDown = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;

    cleanupDragListenersRef.current?.();
    downPositionRef.current = { clientX: e.clientX, clientY: e.clientY };
    suppressClickRef.current = false;
    setIsDraggingFromButton(false);

    const onMouseMove = (ev: MouseEvent) => {
      const start = downPositionRef.current;
      if (!start) return;

      const dx = ev.clientX - start.clientX;
      const dy = ev.clientY - start.clientY;
      const threshold = 3;
      if (Math.abs(dx) >= threshold || Math.abs(dy) >= threshold) {
        if (!suppressClickRef.current) {
          suppressClickRef.current = true;
          setIsDraggingFromButton(true);
          setIsButtonVisible(false);
        }
      }
    };

    const onMouseUp = () => {
      cleanupDragListenersRef.current?.();
      downPositionRef.current = null;
      const wasDragging = suppressClickRef.current;
      suppressClickRef.current = false;
      setIsDraggingFromButton(false);
      if (wasDragging && hoverRef.current) setIsButtonVisible(true);
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      cleanupDragListenersRef.current = null;
    };

    cleanupDragListenersRef.current = cleanup;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handlePointerDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 2) return;
    if (!hoverRef.current) return;

    setIsPointerDown(true);

    cleanupPointerListenersRef.current?.();
    const onMouseUp = () => {
      cleanupPointerListenersRef.current?.();
      setIsPointerDown(false);
    };

    const cleanup = () => {
      window.removeEventListener("mouseup", onMouseUp);
      cleanupPointerListenersRef.current = null;
    };

    cleanupPointerListenersRef.current = cleanup;
    window.addEventListener("mouseup", onMouseUp);
  };

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      cleanupDragListenersRef.current?.();
      cleanupPointerListenersRef.current?.();
    };
  }, []);

  return (
    <div
      className="relative h-full w-full"
      onMouseDownCapture={handlePointerDown}
      onMouseMove={(e) => {
        if (!currentViewData) return;
        const rect = e.currentTarget.getBoundingClientRect();
        latestButtonXPositionRef.current = e.clientX - rect.left;
        scheduleButtonPositionUpdate();
      }}
      onMouseEnter={() => {
        hoverRef.current = true;
        if (!isDraggingFromButton) setIsButtonVisible(true);
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
        setIsPointerDown(false);
        setIsButtonVisible(false);
      }}
    >
      {isButtonVisible && (
        <Tooltip
          tooltipContent={buttonStartDate && renderFormattedDate(buttonStartDate)}
          isMobile={isMobile}
          disabled={isPointerDown}
        >
          <button
            type="button"
            className={`absolute left-0 top-1/2 h-8 w-8 bg-custom-background-80 p-1.5 rounded-full border border-custom-border-300 grid place-items-center text-custom-text-200 hover:text-custom-text-100 ${
              isPointerDown ? "opacity-0" : ""
            }`}
            style={{
              transform: `translate3d(${buttonXPosition}px, -50%, 0) translateX(-50%)`,
              willChange: "transform",
            }}
            data-allow-pan="true"
            onMouseDown={handleButtonMouseDown}
            onClick={handleButtonClick}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      )}
    </div>
  );
});
