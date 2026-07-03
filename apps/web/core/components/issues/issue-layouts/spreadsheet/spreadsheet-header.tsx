/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MouseEvent as ReactMouseEvent } from "react";
import { useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// constants
import { SPREADSHEET_SELECT_GROUP } from "@plane/constants";
// icons
import { EpicIcon, WorkItemsIcon } from "@plane/propel/icons";
// ui
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
// components
import { cn } from "@plane/utils";
import { MultipleSelectGroupAction } from "@/components/core/multiple-select";
// hooks
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { SpreadsheetHeaderColumn } from "./spreadsheet-header-column";

interface Props {
  displayProperties: IIssueDisplayProperties;
  displayFilters: IIssueDisplayFilterOptions;
  handleDisplayFilterUpdate: (data: Partial<IIssueDisplayFilterOptions>) => void;
  canEditProperties: (projectId: string | undefined) => boolean;
  isEstimateEnabled: boolean;
  spreadsheetColumnsList: (keyof IIssueDisplayProperties)[];
  selectionHelpers: TSelectionHelper;
  workItemColumnWidth: number;
  onWorkItemColumnResize: (width: number) => void;
  isEpic?: boolean;
}

export const SpreadsheetHeader = observer(function SpreadsheetHeader(props: Props) {
  const {
    displayProperties,
    displayFilters,
    handleDisplayFilterUpdate,
    canEditProperties,
    isEstimateEnabled,
    spreadsheetColumnsList,
    selectionHelpers,
    workItemColumnWidth,
    onWorkItemColumnResize,
    isEpic = false,
  } = props;
  // router
  const { projectId } = useParams();
  const headerRef = useRef<HTMLTableCellElement | null>(null);
  // derived values
  const isGroupSelectionEmpty = selectionHelpers.isGroupSelected(SPREADSHEET_SELECT_GROUP) === "empty";
  // auth
  const canSelectIssues = canEditProperties(projectId?.toString()) && !selectionHelpers.isSelectionDisabled;

  const handleResizeMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = headerRef.current?.getBoundingClientRect().width ?? workItemColumnWidth;

    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      onWorkItemColumnResize(startWidth + (moveEvent.clientX - startX));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <thead className="sticky top-0 left-0 z-[12] border-b-[0.5px] border-subtle">
      <tr>
        {/* Single header column containing both identifier and workitem */}
        <th
          ref={headerRef}
          className="group/list-header relative left-0 z-[15] h-11 border-r-[0.5px] border-subtle bg-layer-1 text-13 font-medium md:sticky"
          style={{
            width: workItemColumnWidth,
            minWidth: workItemColumnWidth,
            maxWidth: workItemColumnWidth,
          }}
          tabIndex={-1}
        >
          <div className="flex h-full w-full items-center gap-2 px-page-x">
            {/* Workitem header section */}
            <div className="flex h-full w-full min-w-0 items-center gap-1 py-2.5">
              {canSelectIssues && (
                // 占位：在 flex 流内保留原有的宽度，保证「Work items」文字位置不变
                <div className="mr-1 flex w-3.5 flex-shrink-0 items-center" aria-hidden />
              )}
              {isEpic ? (
                <EpicIcon className="h-3.5 w-3.5 flex-shrink-0 text-placeholder" />
              ) : (
                <WorkItemsIcon className="h-3.5 w-3.5 flex-shrink-0 text-placeholder" />
              )}
              <span className="text-13 font-medium">{`${isEpic ? "Epics" : "工作项"}`}</span>
            </div>
          </div>
          {canSelectIssues && (
            // 实际勾选框：绝对定位到 left-1，与 SpreadsheetIssueRow 中 absolute left-1 的行复选框列对齐
            <div className="absolute inset-y-0 left-1 grid w-3.5 flex-shrink-0 place-items-center">
              <MultipleSelectGroupAction
                className={cn(
                  "pointer-events-none size-3.5 opacity-0 !outline-none group-hover/list-header:pointer-events-auto group-hover/list-header:opacity-100",
                  {
                    "pointer-events-auto opacity-100": !isGroupSelectionEmpty,
                  }
                )}
                groupID={SPREADSHEET_SELECT_GROUP}
                selectionHelpers={selectionHelpers}
              />
            </div>
          )}
          <div
            className="absolute right-0 top-0 z-[1] h-full w-2 cursor-col-resize"
            onMouseDown={handleResizeMouseDown}
            role="presentation"
          >
            <div className="absolute right-0 top-0 h-full w-px bg-transparent transition-colors group-hover/list-header:bg-accent-primary/50" />
          </div>
        </th>

        {spreadsheetColumnsList.map((property) => (
          <SpreadsheetHeaderColumn
            key={property}
            property={property}
            displayProperties={displayProperties}
            displayFilters={displayFilters}
            handleDisplayFilterUpdate={handleDisplayFilterUpdate}
            isEstimateEnabled={isEstimateEnabled}
            isEpic={isEpic}
          />
        ))}
      </tr>
    </thead>
  );
});
