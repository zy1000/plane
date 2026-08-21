/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { usePopper } from "react-popper";
import { useTimesheet } from "@/hooks/store/use-timesheet";
import { TimesheetPanel } from "@/plane-web/components/issues/worklog/timesheet-panel";

type TTestCaseTimesheetFieldProps = {
  caseId: string;
  projectId?: string;
};

function formatTotalHours(hours: number): string {
  if (hours === 0) return "登记工时";
  return `${hours}h`;
}

export function TestCaseTimesheetField(props: TTestCaseTimesheetFieldProps) {
  const { caseId, projectId } = props;
  const { workspaceSlug, projectId: routeProjectId } = useParams() as { workspaceSlug?: string; projectId?: string };

  const resolvedProjectId = projectId || routeProjectId;
  const [isOpen, setIsOpen] = useState(false);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { timesheets, totalHours, isLoading, fetchTimesheets, createTimesheet, deleteTimesheet } = useTimesheet(
    workspaceSlug,
    resolvedProjectId,
    undefined,
    caseId
  );

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "left-start",
    modifiers: [{ name: "preventOverflow", options: { padding: 16 } }],
  });

  const popperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      if (popperRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen]);

  useEffect(() => {
    fetchTimesheets();
  }, [fetchTimesheets]);

  return (
    <div ref={dropdownRef} className="relative flex-1 min-w-0">
      <button
        ref={setReferenceElement}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full rounded-md border-0 bg-transparent px-0 py-1.5 text-left text-sm text-primary transition-colors hover:bg-accent-primary/5"
      >
        {formatTotalHours(totalHours)}
      </button>
      {isOpen &&
        createPortal(
          <div
            ref={(node) => {
              popperRef.current = node;
              setPopperElement(node);
            }}
            style={styles.popper}
            {...attributes.popper}
            className="z-[2000] rounded-md border border-subtle bg-surface-1 shadow-lg overflow-visible"
          >
            <TimesheetPanel
              workspaceSlug={workspaceSlug}
              testCaseId={caseId}
              timesheets={timesheets}
              isLoading={isLoading}
              totalHours={totalHours}
              createTimesheet={createTimesheet}
              deleteTimesheet={deleteTimesheet}
              onClose={() => setIsOpen(false)}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
