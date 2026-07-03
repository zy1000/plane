/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties, TIssue } from "@plane/types";
// components
import { SpreadsheetIssueRowLoader } from "@/components/ui/loader/layouts/spreadsheet-layout-loader";
// hooks
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { useTableKeyboardNavigation } from "@/hooks/use-table-keyboard-navigation";
// local imports
import type { TRenderQuickActions } from "../list/list-view-types";
import { SpreadsheetIssueRow } from "./issue-row";
import { SpreadsheetHeader } from "./spreadsheet-header";

type Props = {
  displayProperties: IIssueDisplayProperties;
  displayFilters: IIssueDisplayFilterOptions;
  handleDisplayFilterUpdate: (data: Partial<IIssueDisplayFilterOptions>) => void;
  issueIds: string[];
  isEstimateEnabled: boolean;
  quickActions: TRenderQuickActions;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  canEditProperties: (projectId: string | undefined) => boolean;
  portalElement: React.MutableRefObject<HTMLDivElement | null>;
  containerRef: MutableRefObject<HTMLTableElement | null>;
  canLoadMoreIssues: boolean;
  loadMoreIssues: () => void;
  spreadsheetColumnsList: (keyof IIssueDisplayProperties)[];
  selectionHelpers: TSelectionHelper;
  isEpic?: boolean;
};

const DEFAULT_WORK_ITEM_COLUMN_WIDTH = 420;
const MIN_WORK_ITEM_COLUMN_WIDTH = 320;
const MAX_WORK_ITEM_COLUMN_WIDTH = 900;
const PROPERTY_COLUMN_WIDTH = 144;
// border-collapse 下最右侧单元格的外边框会额外多撑出约 1px，自动填充时需预留出来
const TABLE_COLLAPSED_BORDER_WIDTH = 1;

export const SpreadsheetTable = observer(function SpreadsheetTable(props: Props) {
  const {
    displayProperties,
    displayFilters,
    handleDisplayFilterUpdate,
    issueIds,
    isEstimateEnabled,
    portalElement,
    quickActions,
    updateIssue,
    canEditProperties,
    canLoadMoreIssues,
    containerRef,
    loadMoreIssues,
    spreadsheetColumnsList,
    selectionHelpers,
    isEpic = false,
  } = props;

  // states
  const isScrolled = useRef(false);
  const [intersectionElement, setIntersectionElement] = useState<HTMLTableSectionElement | null>(null);
  const [workItemColumnWidth, setWorkItemColumnWidth] = useState(DEFAULT_WORK_ITEM_COLUMN_WIDTH);
  const [containerWidth, setContainerWidth] = useState(0);

  const {
    issues: { getIssueLoader },
  } = useIssuesStore();

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollLeft = containerRef.current.scrollLeft;

    const columnShadow = "8px 22px 22px 10px rgba(0, 0, 0, 0.05)"; // shadow for regular columns
    const headerShadow = "8px -22px 22px 10px rgba(0, 0, 0, 0.05)"; // shadow for headers

    //The shadow styles are added this way to avoid re-render of all the rows of table, which could be costly
    if (scrollLeft > 0 !== isScrolled.current) {
      const firstColumns = containerRef.current.querySelectorAll("table tr td:first-child, th:first-child");

      for (let i = 0; i < firstColumns.length; i++) {
        const shadow = i === 0 ? headerShadow : columnShadow;
        if (scrollLeft > 0) {
          (firstColumns[i] as HTMLElement).style.boxShadow = shadow;
        } else {
          (firstColumns[i] as HTMLElement).style.boxShadow = "none";
        }
      }
      isScrolled.current = scrollLeft > 0;
    }
  }, [containerRef]);

  const handleWorkItemColumnResize = useCallback((nextWidth: number) => {
    const clampedWidth = Math.max(MIN_WORK_ITEM_COLUMN_WIDTH, Math.min(MAX_WORK_ITEM_COLUMN_WIDTH, Math.round(nextWidth)));
    setWorkItemColumnWidth(clampedWidth);
  }, []);

  const visibleSpreadsheetColumnsList = spreadsheetColumnsList.filter((property) => {
    if (!displayProperties[property]) return false;
    if (property === "estimate" && !isEstimateEnabled) return false;
    return true;
  });

  const visiblePropertiesWidth = visibleSpreadsheetColumnsList.length * PROPERTY_COLUMN_WIDTH;
  const resolvedWorkItemColumnWidth = Math.max(
    workItemColumnWidth,
    Math.floor(containerWidth - visiblePropertiesWidth - TABLE_COLLAPSED_BORDER_WIDTH)
  );
  const tableWidth = resolvedWorkItemColumnWidth + visiblePropertiesWidth;

  useEffect(() => {
    const currentContainerRef = containerRef.current;

    if (currentContainerRef) currentContainerRef.addEventListener("scroll", handleScroll);

    return () => {
      if (currentContainerRef) currentContainerRef.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll, containerRef]);

  useEffect(() => {
    const currentContainerRef = containerRef.current;
    if (!currentContainerRef) return;

    const updateContainerWidth = () => setContainerWidth(currentContainerRef.clientWidth);
    updateContainerWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateContainerWidth);
      return () => window.removeEventListener("resize", updateContainerWidth);
    }

    const resizeObserver = new ResizeObserver(updateContainerWidth);
    resizeObserver.observe(currentContainerRef);

    return () => resizeObserver.disconnect();
  }, [containerRef]);

  const isPaginating = !!getIssueLoader();

  useIntersectionObserver(containerRef, isPaginating ? null : intersectionElement, loadMoreIssues, `100% 0% 100% 0%`);

  const handleKeyBoardNavigation = useTableKeyboardNavigation();

  return (
    <table
      className="min-w-full table-fixed overflow-y-auto bg-surface-1"
      style={{ width: tableWidth }}
      onKeyDown={handleKeyBoardNavigation}
    >
      <colgroup>
        <col style={{ width: resolvedWorkItemColumnWidth }} />
        {visibleSpreadsheetColumnsList.map((property) => (
          <col key={property} style={{ width: PROPERTY_COLUMN_WIDTH }} />
        ))}
      </colgroup>
      <SpreadsheetHeader
        displayProperties={displayProperties}
        displayFilters={displayFilters}
        handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        canEditProperties={canEditProperties}
        isEstimateEnabled={isEstimateEnabled}
        spreadsheetColumnsList={visibleSpreadsheetColumnsList}
        selectionHelpers={selectionHelpers}
        workItemColumnWidth={resolvedWorkItemColumnWidth}
        onWorkItemColumnResize={handleWorkItemColumnResize}
        isEpic={isEpic}
      />
      <tbody>
        {issueIds.map((id) => (
          <SpreadsheetIssueRow
            key={id}
            issueId={id}
            displayProperties={displayProperties}
            quickActions={quickActions}
            canEditProperties={canEditProperties}
            nestingLevel={0}
            isEstimateEnabled={isEstimateEnabled}
            updateIssue={updateIssue}
            portalElement={portalElement}
            containerRef={containerRef}
            isScrolled={isScrolled}
            spreadsheetColumnsList={visibleSpreadsheetColumnsList}
            selectionHelpers={selectionHelpers}
            workItemColumnWidth={resolvedWorkItemColumnWidth}
            isEpic={isEpic}
          />
        ))}
      </tbody>
      {canLoadMoreIssues && (
        <tfoot ref={setIntersectionElement}>
          {Array.from({ length: 3 }).map((_, index) => (
            <SpreadsheetIssueRowLoader key={index} columnCount={visibleSpreadsheetColumnsList.length} />
          ))}
        </tfoot>
      )}
    </table>
  );
});
