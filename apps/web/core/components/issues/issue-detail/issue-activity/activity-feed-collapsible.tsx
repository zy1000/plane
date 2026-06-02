/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

type TActivityFeedCollapsibleProps = {
  resetKey: string;
  listLength: number;
  maxHeightPx?: number;
  children: ReactNode;
};

const ACTIVITY_FEED_COLLAPSED_MAX_HEIGHT_PX = 320;

export function ActivityFeedCollapsible(props: TActivityFeedCollapsibleProps) {
  const { resetKey, listLength, maxHeightPx = ACTIVITY_FEED_COLLAPSED_MAX_HEIGHT_PX, children } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsExpanded(false);
  }, [resetKey]);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const measure = () => {
      const overflow = el.scrollHeight - maxHeightPx > 1;
      setIsOverflowing(overflow);
    };

    measure();

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      const target = el.firstElementChild ?? el;
      observer.observe(target);
    }

    return () => {
      observer?.disconnect();
    };
  }, [resetKey, listLength, isExpanded, maxHeightPx]);

  const showCollapsedFade = !isExpanded && isOverflowing;
  const collapsedBottomFadeMask =
    "linear-gradient(to bottom, #000 0%, #000 64%, rgba(0,0,0,0.5) 82%, rgba(0,0,0,0) 100%)";

  return (
    <div className="space-y-1">
      <div
        ref={wrapperRef}
        className="relative overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{
          maxHeight: isExpanded || !isOverflowing ? "none" : `${maxHeightPx}px`,
          ...(showCollapsedFade
            ? {
                WebkitMaskImage: collapsedBottomFadeMask,
                maskImage: collapsedBottomFadeMask,
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
              }
            : {
                WebkitMaskImage: "none",
                maskImage: "none",
              }),
        }}
      >
        {children}
      </div>
      {isOverflowing && (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="text-body-sm-medium text-accent-primary hover:underline"
        >
          {isExpanded ? "显示更少" : "显示更多"}
        </button>
      )}
    </div>
  );
}
