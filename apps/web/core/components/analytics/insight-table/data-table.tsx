/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  Table as TanstackTable,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Pagination } from "antd";

import { useTranslation } from "@plane/i18n";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { SearchIcon, CloseIcon } from "@plane/propel/icons";
import { IconButton } from "@plane/propel/icon-button";
// plane package imports
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { Header } from "@plane/ui";
import { cn } from "@plane/utils";
// plane web components

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder: string;
  toolbarLabel?: React.ReactNode;
  actions?: (table: TanstackTable<TData>) => React.ReactNode;
  filtersRow?: React.ReactNode;
  searchTriggerPosition?: "left" | "actions-left";
  searchToolbarMount?: HTMLElement | null;
  enablePagination?: boolean;
  pageSize?: number;
  showPaginationSummary?: boolean;
  fillHeight?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder,
  toolbarLabel,
  actions,
  filtersRow,
  searchTriggerPosition = "left",
  searchToolbarMount,
  enablePagination = false,
  pageSize = 20,
  showPaginationSummary = true,
  fillHeight = false,
}: DataTableProps<TData, TValue>) {
  const [rowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const { t } = useTranslation();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);

  const table = useReactTable({
    data,
    columns,
    initialState: enablePagination
      ? {
          pagination: {
            pageIndex: 0,
            pageSize,
          },
        }
      : undefined,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    ...(enablePagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  });

  const filteredRowsCount = enablePagination ? table.getFilteredRowModel().rows.length : 0;
  const currentPage = enablePagination ? table.getState().pagination.pageIndex + 1 : 1;
  const currentPageSize = enablePagination ? table.getState().pagination.pageSize : pageSize;
  const startIndex = filteredRowsCount > 0 ? (currentPage - 1) * currentPageSize : 0;
  const endIndex = filteredRowsCount > 0 ? Math.min(currentPage * currentPageSize, filteredRowsCount) : 0;

  const handlePaginationChange = React.useCallback(
    (nextPage: number, nextPageSize?: number) => {
      if (!enablePagination) return;
      const targetPageSize = nextPageSize ?? table.getState().pagination.pageSize;
      if (targetPageSize !== table.getState().pagination.pageSize) {
        table.setPageSize(targetPageSize);
      }
      table.setPageIndex(Math.max(nextPage - 1, 0));
    },
    [enablePagination, table]
  );

  const firstColumnId = table.getHeaderGroups()?.[0]?.headers?.[0]?.id;

  const handleSearchOpen = React.useCallback(() => {
    setIsSearchOpen(true);
    inputRef.current?.focus();
  }, []);

  const handleSearchClose = React.useCallback(() => {
    if (firstColumnId) {
      table.getColumn(firstColumnId)?.setFilterValue("");
    }
    setIsSearchOpen(false);
  }, [firstColumnId, table]);

  const searchControl = React.useCallback(
    (position: "left" | "actions-left") => (
      <>
        {!isSearchOpen && (
          <>
            {position === "actions-left" ? (
              <IconButton
                type="button"
                variant="ghost"
                size="lg"
                icon={SearchIcon}
                className="-mr-1"
                onClick={handleSearchOpen}
              />
            ) : (
              <button
                type="button"
                className={cn("grid place-items-center rounded-sm p-2 text-placeholder hover:bg-layer-1", {
                  "-mr-5": position === "left",
                })}
                onClick={handleSearchOpen}
              >
                <SearchIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
        <div
          className={cn(
            "flex w-0 items-center justify-start gap-1 overflow-hidden rounded-md border border-transparent bg-surface-1 text-placeholder opacity-0 transition-[width] ease-linear",
            {
              "mr-auto": position === "left",
              "w-64 border-subtle px-2.5 py-1.5 opacity-100": isSearchOpen,
            }
          )}
        >
          <SearchIcon className="h-3.5 w-3.5" />
          <input
            ref={inputRef}
            className="w-full max-w-[234px] border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
            placeholder="Search"
            value={(firstColumnId ? table.getColumn(firstColumnId)?.getFilterValue() : "") as string}
            onChange={(e) => {
              if (firstColumnId) table.getColumn(firstColumnId)?.setFilterValue(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setIsSearchOpen(true);
              }
            }}
          />
          {isSearchOpen && (
            <button type="button" className="grid place-items-center" onClick={handleSearchClose}>
              <CloseIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </>
    ),
    [firstColumnId, handleSearchClose, handleSearchOpen, isSearchOpen, table]
  );

  const useExternalSearchToolbar = searchToolbarMount !== undefined;
  const toolbarLabelNode =
    toolbarLabel !== undefined ? (
      toolbarLabel
    ) : (
      <div className="flex items-center gap-2 text-13 whitespace-nowrap text-placeholder">{searchPlaceholder}</div>
    );
  const searchToolbar = (
    <div className="relative flex max-w-[300px] items-center gap-4">
      {firstColumnId && toolbarLabelNode}
      {searchTriggerPosition === "left" && searchControl("left")}
    </div>
  );

  return (
    <div className={cn(fillHeight ? "flex h-full min-h-0 flex-col" : "space-y-4")}>
      {fillHeight ? (
        <Header className="h-11 border-b border-subtle px-page-x">
          <Header.LeftItem>
            {toolbarLabel !== undefined || firstColumnId ? toolbarLabelNode : null}
            {searchTriggerPosition === "left" && searchControl("left")}
          </Header.LeftItem>
          <Header.RightItem>
            {searchTriggerPosition === "actions-left" && searchControl("actions-left")}
            {actions ? actions(table) : null}
          </Header.RightItem>
        </Header>
      ) : (
        (useExternalSearchToolbar ? Boolean(actions) : true) && (
          <div className="flex w-full items-center justify-between">
            {!useExternalSearchToolbar && searchToolbar}
            <div
              className={cn("flex items-center", {
                "ml-auto": useExternalSearchToolbar,
                "gap-1": searchTriggerPosition === "actions-left",
                "gap-2": searchTriggerPosition !== "actions-left",
              })}
            >
              {searchTriggerPosition === "actions-left" && searchControl("actions-left")}
              {actions && <div>{actions(table)}</div>}
            </div>
          </div>
        )
      )}
      {useExternalSearchToolbar && searchToolbarMount && createPortal(searchToolbar, searchToolbarMount)}
      {fillHeight && filtersRow ? <div className="flex-shrink-0">{filtersRow}</div> : filtersRow}

      <div className={cn(!fillHeight && "rounded-md", fillHeight && "flex min-h-0 flex-1 flex-col overflow-hidden")}>
        <div className={cn(fillHeight && "min-h-0 flex-1 overflow-hidden")}>
          <Table wrapperClassName={fillHeight ? "h-full" : undefined}>
            <TableHeader className={fillHeight ? "sticky top-0 z-[2] border-t-0 bg-layer-1" : undefined}>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} colSpan={header.colSpan} className="whitespace-nowrap">
                      {header.isPlaceholder
                        ? null
                        : (flexRender(header.column.columnDef.header, header.getContext()) as any)}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext()) as any}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="p-0">
                    <EmptyStateCompact
                      assetKey="unknown"
                      assetClassName="size-20"
                      rootClassName="border border-subtle px-5 py-10 md:py-20 md:px-20"
                      title={t("workspace_empty_state.analytics_work_items.title")}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {enablePagination && table.getPageCount() > 0 && (
          <div
            className={cn(
              "flex flex-shrink-0 items-center border-t border-subtle bg-surface-1",
              fillHeight ? "px-page-x py-1.5" : "px-4 py-3",
              showPaginationSummary ? "justify-between" : "justify-end"
            )}
          >
            {showPaginationSummary ? (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-secondary">
                  {filteredRowsCount > 0 ? `第 ${startIndex + 1}-${endIndex} 条，共 ${filteredRowsCount} 条` : ""}
                </span>
              </div>
            ) : null}
            <Pagination
              simple
              current={currentPage}
              pageSize={currentPageSize}
              total={filteredRowsCount}
              showSizeChanger
              pageSizeOptions={["10", "20", "50", "100"]}
              onChange={handlePaginationChange}
              onShowSizeChange={handlePaginationChange}
              size="small"
            />
          </div>
        )}
      </div>
    </div>
  );
}
