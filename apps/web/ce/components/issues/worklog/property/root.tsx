/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { Clock } from "lucide-react";
import { usePopper } from "react-popper";
import { useTimesheet } from "@/hooks/store/use-timesheet";
import { TimesheetPanel } from "../timesheet-panel";

type TIssueWorklogProperty = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

function formatHoursDisplay(hours: number): string {
  if (hours === 0) return "0h";
  return `${hours}h`;
}

export const IssueWorklogProperty = observer(function IssueWorklogProperty(props: TIssueWorklogProperty) {
  const { workspaceSlug, projectId, issueId, disabled } = props;

  const { timesheets, isLoading, totalHours, fetchTimesheets, createTimesheet, deleteTimesheet } = useTimesheet(
    workspaceSlug,
    projectId,
    issueId
  );

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "bottom-start",
    modifiers: [
      { name: "offset", options: { offset: [0, 4] } },
      { name: "preventOverflow", options: { padding: 12 } },
      { name: "flip", options: { fallbackPlacements: ["top-start", "bottom-end", "top-end"] } },
    ],
  });

  const popperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTimesheets();
  }, [fetchTimesheets]);

  const closePopover = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      if (popperRef.current?.contains(target)) return;
      closePopover();
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7.5 w-30 shrink-0 items-center gap-1.5 text-body-xs-regular text-tertiary">
        <Clock className="size-4 shrink-0" />
        <span>工时</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <div ref={dropdownRef} className="relative w-full">
          <button
            ref={setReferenceElement}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (!disabled) setIsOpen((prev) => !prev);
            }}
            className="flex h-7.5 w-full items-center gap-1 rounded px-2 text-body-xs-medium text-secondary hover:bg-layer-1-hover transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="tabular-nums">
              {isLoading ? "..." : formatHoursDisplay(totalHours)}
            </span>
          </button>
          {isOpen &&
            createPortal(
              <div
                ref={(node) => {
                  popperRef.current = node;
                  setPopperElement(node);
                }}
                data-prevent-outside-click
                style={styles.popper}
                {...attributes.popper}
                className="z-[2000] rounded-lg border border-subtle bg-surface-1 shadow-raised-300 overflow-hidden"
              >
                <TimesheetPanel
                  workspaceSlug={workspaceSlug}
                  issueId={issueId}
                  timesheets={timesheets}
                  isLoading={isLoading}
                  totalHours={totalHours}
                  createTimesheet={createTimesheet}
                  deleteTimesheet={deleteTimesheet}
                  onClose={closePopover}
                />
              </div>,
              document.body
            )}
        </div>
      </div>
    </div>
  );
});
