/**
 * 项目需求网格：需求内容只读，唯一能写的是需求级交付状态（RequirementStatusCell 下拉，
 * 与关联/解除共用 canManage）。
 *
 * 没有复用 components/requirements/requirement-grid.tsx —— 那个网格是「一个需求类型
 * 一张表」的可编辑录入界面，整套暂存/批量保存/乐观锁机制在项目侧全无用武之地。
 *
 * 表格骨架与量化常量取自 requirement-grid-shared，与另外两个需求网格共用一套：
 * 标题列左固定并吃掉容器剩余宽度、其余列定宽、行高 44px、勾选框折进标题格里悬停显形。
 *
 * 列不再全铺：默认 9 列（约 1152px 固定宽），其余靠「列设置」勾回，偏好按项目存
 * localStorage。见 project-requirements-columns.ts。
 */
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pagination } from "antd";
import { Columns3, Loader as LoaderIcon, Package } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProjectRequirement, TRequirementItemStatus, TRequirementTypeSchema } from "@plane/types";
import { Checkbox, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { RequirementApprovalCell } from "@/components/products/requirements/approval/requirement-approval-cell";
import { ProductChip } from "@/components/products/product-chip";
import { RequirementStatusCell } from "@/components/requirements";
import { BuiltinCellValue, REQUIREMENT_BUILTIN_COLUMNS } from "@/components/requirements/requirement-builtin-fields";
import {
  getCurrentPageOffset,
  getRequirementColumnWidth,
  REQUIREMENT_GRID_BODY_CELL_CLASS,
  REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
  REQUIREMENT_GRID_COLUMN_WIDTH,
  REQUIREMENT_GRID_HEADER_CELL_CLASS,
  REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS,
  REQUIREMENT_GRID_ROW_CLASS,
  REQUIREMENT_GRID_ROW_SELECTED_CLASS,
  REQUIREMENT_GRID_STICKY_BODY_CLASS,
  REQUIREMENT_GRID_STICKY_HEADER_CLASS,
  RequirementGridHeaderLabel,
  resolveRequirementTitleColumnWidth,
  useRequirementGridScrollContainer,
} from "@/components/requirements/requirement-grid-shared";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import {
  COLUMN_LABEL_KEYS,
  defaultHiddenColumns,
  getColumnStorageKey,
  readHiddenColumns,
  TOGGLEABLE_COLUMNS,
  type TProjectRequirementColumnKey,
} from "./project-requirements-columns";

type TProps = {
  workspaceSlug: string;
  projectId: string;
  requirementTypes: TRequirementTypeSchema[];
  requirements: TProjectRequirement[];
  totalCount: number;
  perPage: number;
  nextCursor?: string;
  prevCursor?: string;
  nextPageResults?: boolean;
  prevPageResults?: boolean;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  onRetry: () => void;
  /** 有 project.requirement_link.manage 才能关联/解除关联 */
  canManage: boolean;
  /** 有 project.product_link.manage 才能改「本项目引用哪些产品」 */
  canManageProducts: boolean;
  onManageProducts: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  onCursorChange: (value: string | undefined) => void;
  onPerPageChange: (value: number) => void;
  onOpenDetail: (requirementId: string) => void;
  onLink: () => void;
  onUnlink: (requirementIds: string[]) => void;
  /** 改需求级交付状态。与关联/解除共用 canManage，不单设权限 key；不传则状态列恒只读 */
  onStatusChange?: (requirementId: string, status: TRequirementItemStatus) => void;
  /** 与筛选行共用容器：换筛选/换页时右上角那排控件不该跟着卸载重建 */
  toolbarPortalEl?: HTMLElement | null;
  /** 插在搜索后面、其余操作前面，例如过滤按钮 */
  toolbarAfterSearch?: ReactNode;
  /** 一条产品都没关联时，空态该说的是「先去关联产品」而不是「没有需求」 */
  hasLinkedProducts: boolean;
  /** 本项目到底有没有关联过需求（取自分面总数，不随筛选变化） */
  hasAnyLinked: boolean;
  /** 当前生效的分面筛选数量。用来区分「没关联」和「筛没了」 */
  activeFilterCount: number;
  onClearFilters: () => void;
};

export const ProjectRequirementsGrid = (props: TProps) => {
  const {
    workspaceSlug,
    projectId,
    requirementTypes,
    requirements,
    totalCount,
    perPage,
    nextCursor,
    prevCursor,
    nextPageResults,
    prevPageResults,
    isLoading,
    isMutating,
    error,
    onRetry,
    canManage,
    canManageProducts,
    onManageProducts,
    search,
    onSearchChange,
    onCursorChange,
    onPerPageChange,
    onOpenDetail,
    onLink,
    onUnlink,
    onStatusChange,
    toolbarPortalEl,
    toolbarAfterSearch,
    hasLinkedProducts,
    hasAnyLinked,
    activeFilterCount,
    onClearFilters,
  } = props;
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState(search);
  const [isSearchOpen, setIsSearchOpen] = useState(() => search.trim().length > 0);
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  // --- 列显隐 ---------------------------------------------------------
  const [hiddenColumns, setHiddenColumns] = useState<TProjectRequirementColumnKey[]>(() =>
    readHiddenColumns(projectId)
  );
  // 切项目时要换成那个项目的偏好，否则会把上一个项目的勾选带过去
  useEffect(() => setHiddenColumns(readHiddenColumns(projectId)), [projectId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(getColumnStorageKey(projectId), JSON.stringify(hiddenColumns));
  }, [hiddenColumns, projectId]);
  useOutsideClickDetector(columnsRef, () => setIsColumnsOpen(false));

  const isVisible = useCallback(
    (key: TProjectRequirementColumnKey) => !hiddenColumns.includes(key),
    [hiddenColumns]
  );
  const visibleColumns = useMemo(
    () => TOGGLEABLE_COLUMNS.filter(isVisible),
    [isVisible]
  );
  const toggleColumn = (key: TProjectRequirementColumnKey) =>
    setHiddenColumns((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );

  const builtinByKey = useMemo(
    () => Object.fromEntries(REQUIREMENT_BUILTIN_COLUMNS.map((column) => [column.key, column])),
    []
  );
  const columnLabel = useCallback(
    (key: TProjectRequirementColumnKey) => {
      const own = COLUMN_LABEL_KEYS[key];
      if (own) return t(own);
      const builtin = builtinByKey[key];
      return builtin ? t(builtin.labelKey) : key;
    },
    [builtinByKey, t]
  );

  // --- 搜索 -----------------------------------------------------------
  const scheduleSearch = (value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => onSearchChange(value), 300);
  };

  const clearSearch = () => {
    setSearchInput("");
    if (searchTimer.current) clearTimeout(searchTimer.current);
    onSearchChange("");
    setIsSearchOpen(false);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      const trimmedQuery = searchInput.trim();
      setSearchInput(trimmedQuery);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      onSearchChange(trimmedQuery);
      return;
    }
    if (event.key === "Escape") {
      if (searchInput.trim() !== "") clearSearch();
      else {
        setIsSearchOpen(false);
        searchInputRef.current?.blur();
      }
    }
  };

  useOutsideClickDetector(searchInputRef, () => {
    if (isSearchOpen && searchInput.trim() === "") setIsSearchOpen(false);
  });

  useEffect(() => {
    if (document.activeElement !== searchInputRef.current) setSearchInput(search);
    if (search.trim().length > 0) setIsSearchOpen(true);
  }, [search]);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    []
  );

  // 换页/换筛选后选区里的 id 可能已经不在本页了，留着会让「解除关联 N 条」数不对
  useEffect(() => {
    const visible = new Set(requirements.map((requirement) => requirement.id));
    setSelectedIds((current) => current.filter((id) => visible.has(id)));
  }, [requirements]);

  const requirementTypeNames = useMemo(
    () => Object.fromEntries(requirementTypes.map((requirementType) => [requirementType.id, requirementType.name])),
    [requirementTypes]
  );

  const titleColumn = builtinByKey["title"];
  const { setScrollContainer, containerWidth } = useRequirementGridScrollContainer();

  /** 每列的宽度：内置列各有自己的宽度定义，本页特有列一律 144px */
  const columnWidth = useCallback(
    (key: TProjectRequirementColumnKey) =>
      builtinByKey[key] ? getRequirementColumnWidth(key) : REQUIREMENT_GRID_COLUMN_WIDTH,
    [builtinByKey]
  );
  const propertyColumnsWidth = visibleColumns.reduce((total, key) => total + columnWidth(key), 0);
  const titleColumnWidth = resolveRequirementTitleColumnWidth(containerWidth, propertyColumnsWidth);
  const tableWidth = titleColumnWidth + propertyColumnsWidth;

  /**
   * 父项标题只从**本页已有的行**里解析，不额外发请求。
   *
   * 产品页可以用 useRequirementTitles 去补跨页的父项，那里一个网格只服务一个产品；
   * 项目页的行可以横跨多个产品，补齐要按产品分组发 N 次请求，而父项对交付跟踪并不
   * 是关键信息。解析不出来时 BuiltinCellValue 会显示占位文案，绝不会把 UUID 甩出来。
   */
  const titleById = useMemo(
    () => new Map(requirements.map((requirement) => [requirement.id, requirement.title])),
    [requirements]
  );
  const resolveParentTitle = useCallback((parentId: string) => titleById.get(parentId), [titleById]);

  const currentPageOffset = getCurrentPageOffset(prevCursor, nextCursor, prevPageResults, nextPageResults);
  const visibleIds = requirements.map((requirement) => requirement.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const toggleAll = () => setSelectedIds(allSelected ? [] : visibleIds);
  const toggleOne = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  // --- 单元格 ---------------------------------------------------------
  const renderCell = (key: TProjectRequirementColumnKey, requirement: TProjectRequirement) => {
    switch (key) {
      case "display_id":
        return requirement.display_id ? (
          <RequirementIdentifier displayId={requirement.display_id} />
        ) : (
          <span className="text-placeholder">—</span>
        );
      case "product":
        return requirement.product_id ? (
          <ProductChip
            identifier={requirement.product_identifier}
            name={requirement.product_name}
            href={`/${workspaceSlug}/products/${requirement.product_id}/requirements`}
          />
        ) : (
          <span className="text-placeholder">—</span>
        );
      case "issues": {
        /*
         * 关联工作项完成率，与需求状态是两根轴（状态人工维护，不从这里派生）。
         * 口径：分母去掉已取消（cancelled 既不算没做也不算做完）。
         * 全部被取消时分母为 0，百分比无意义，退回占位符。
         */
        if (!requirement.issue_count) return <span className="text-placeholder">—</span>;
        const effectiveCount = requirement.issue_count - requirement.cancelled_issue_count;
        const percent =
          effectiveCount > 0
            ? `${Math.round((requirement.completed_issue_count / effectiveCount) * 100)}%`
            : "—";
        return (
          <span className="text-12 text-secondary">
            {requirement.completed_issue_count}/{effectiveCount} · {percent}
          </span>
        );
      }
      case "approval":
        return <RequirementApprovalCell requirement={requirement} />;
      case "requirement_type":
        return (
          <span className="inline-flex max-w-full items-center rounded-md bg-layer-2 px-2 py-0.5 text-12 text-secondary">
            <span className="truncate">{requirementTypeNames[requirement.requirement_type_id] ?? "—"}</span>
          </span>
        );
      case "status":
        // 需求级交付状态，跨项目共享一份；有 canManage 才是下拉，否则只读胶囊
        return (
          <RequirementStatusCell
            status={requirement.status}
            onChange={
              canManage && onStatusChange ? (next) => onStatusChange(requirement.id, next) : undefined
            }
          />
        );
      default:
        return (
          <BuiltinCellValue columnKey={key} values={requirement} resolveParentTitle={resolveParentTitle} />
        );
    }
  };

  if (isLoading && !requirements.length) {
    return (
      <div className="p-6">
        <Loader>
          <Loader.Item height="420px" />
        </Loader>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid flex-1 place-items-center p-6 text-center">
        <div>
          <p className="text-13 text-secondary">{error}</p>
          <Button variant="neutral-primary" size="sm" className="mt-3" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      </div>
    );
  }

  const toolbar = (
    <div className="flex items-center gap-2">
      {canManage && selectedIds.length > 0 && (
        <Button variant="error-outline" size="sm" disabled={isMutating} onClick={() => onUnlink(selectedIds)}>
          {t("project_requirements.unlink_selected", { count: selectedIds.length })}
        </Button>
      )}
      <div className="flex items-center">
        {!isSearchOpen && (
          <IconButton
            variant="ghost"
            size="lg"
            className="-mr-1"
            onClick={() => {
              setIsSearchOpen(true);
              window.setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
            icon={SearchIcon}
            aria-label={t("search")}
          />
        )}
        <div
          className={cn(
            "box-border flex h-7 w-0 items-center justify-start gap-1 overflow-hidden rounded-md border border-transparent bg-surface-1 text-placeholder opacity-0 transition-[width] ease-linear",
            { "w-30 border-subtle px-2.5 opacity-100 md:w-64": isSearchOpen }
          )}
        >
          <SearchIcon className="h-3.5 w-3.5" />
          <input
            ref={searchInputRef}
            className="w-full max-w-[234px] border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
            placeholder={t("search")}
            value={searchInput}
            onChange={(event) => scheduleSearch(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {isSearchOpen && (
            <button type="button" className="grid place-items-center" onClick={clearSearch}>
              <CloseIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {toolbarAfterSearch}
      <div className="relative" ref={columnsRef}>
        <Tooltip tooltipContent={t("project_requirements.columns")}>
          <IconButton
            variant="ghost"
            size="lg"
            icon={Columns3}
            onClick={() => setIsColumnsOpen((value) => !value)}
            aria-label={t("project_requirements.columns")}
          />
        </Tooltip>
        {isColumnsOpen && (
          <div className="absolute top-9 right-0 z-30 max-h-80 w-56 overflow-y-auto rounded-lg border border-subtle bg-surface-1 p-2 shadow-lg">
            {TOGGLEABLE_COLUMNS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-12 hover:bg-layer-transparent-hover"
              >
                <input type="checkbox" checked={isVisible(key)} onChange={() => toggleColumn(key)} />
                <span className="truncate">{columnLabel(key)}</span>
              </label>
            ))}
            <button
              type="button"
              onClick={() => setHiddenColumns(defaultHiddenColumns())}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-12 text-secondary hover:bg-layer-transparent-hover"
            >
              {t("common.reset")}
            </button>
          </div>
        )}
      </div>
      {canManageProducts && (
        <Button variant="secondary" size="lg" onClick={onManageProducts}>
          <Package className="size-3.5" />
          {t("project_products.manage")}
        </Button>
      )}
      {canManage && (
        <Button variant="primary" size="lg" disabled={isMutating || !hasLinkedProducts} onClick={onLink}>
          {t("project_requirements.link")}
        </Button>
      )}
    </div>
  );

  const isEmpty = requirements.length === 0;
  /**
   * 「一条都没关联」与「当前筛选没命中」是两件事，文案和 CTA 都不一样。
   * hasAnyLinked 用分面总数判断 —— 它不随筛选变化，正是为此存在。
   */
  const hasActiveFilter = Boolean(search.trim() || activeFilterCount);
  const isFilteredEmpty = isEmpty && (hasActiveFilter || hasAnyLinked);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {toolbarPortalEl ? createPortal(toolbar, toolbarPortalEl) : <div className="px-4 py-2">{toolbar}</div>}

      <div
        ref={setScrollContainer}
        className="horizontal-scrollbar vertical-scrollbar scrollbar-lg min-h-0 min-w-0 flex-1 overflow-auto bg-surface-1"
      >
        {/* 没有行就不渲染表格：否则会看到一条空荡荡的表头横在那里，横滚时还会错位 */}
        {isEmpty ? (
          <div className="grid h-full place-items-center p-10 text-center">
            {/*
              三种空态语义完全不同，不能共用一段文案：
              1. 筛没了 —— 有需求，只是当前筛选/搜索没命中，该给的是「清除筛选」
              2. 没关联需求 —— 有产品可选，该给的是「关联需求」
              3. 没关联产品 —— 链路的第一步都没做，该给的是「关联产品」
            */}
            {isFilteredEmpty ? (
              <div className="max-w-md">
                <p className="text-14 font-medium text-primary">
                  {t("project_requirements.filtered_empty.title")}
                </p>
                <p className="mt-1.5 text-13 leading-5 text-secondary">
                  {t("project_requirements.filtered_empty.description")}
                </p>
                {(activeFilterCount > 0 || search.trim()) && (
                  <Button variant="neutral-primary" size="sm" className="mt-4" onClick={onClearFilters}>
                    {t("project_requirements.clear_filters")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="max-w-md">
                <p className="text-14 font-medium text-primary">
                  {t(hasLinkedProducts ? "project_requirements.empty.title" : "project_requirements.no_products.title")}
                </p>
                <p className="mt-1.5 text-13 leading-5 text-secondary">
                  {t(
                    hasLinkedProducts
                      ? "project_requirements.empty.description"
                      : "project_requirements.no_products.description"
                  )}
                </p>
                {hasLinkedProducts
                  ? canManage && (
                      <Button variant="primary" size="lg" className="mt-4" onClick={onLink}>
                        {t("project_requirements.link")}
                      </Button>
                    )
                  : canManageProducts && (
                      <Button variant="primary" size="lg" className="mt-4" onClick={onManageProducts}>
                        {t("project_products.link")}
                      </Button>
                    )}
              </div>
            )}
          </div>
        ) : (
          <table className="table-fixed border-collapse bg-surface-1 text-left text-13" style={{ width: tableWidth }}>
            <colgroup>
              <col style={{ width: titleColumnWidth }} />
              {visibleColumns.map((key) => (
                <col key={key} style={{ width: columnWidth(key) }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-[12] border-b border-subtle text-13 font-medium">
              <tr>
                <th
                  data-requirement-sticky-cell
                  className={cn(
                    "group/header relative",
                    REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS,
                    REQUIREMENT_GRID_STICKY_HEADER_CLASS
                  )}
                  style={{ width: titleColumnWidth, minWidth: titleColumnWidth, maxWidth: titleColumnWidth }}
                >
                  <div className="flex h-full w-full min-w-0 items-center gap-1.5 px-page-x">
                    {canManage && (
                      <Checkbox
                        checked={allSelected}
                        indeterminate={!allSelected && selectedIds.length > 0}
                        disabled={!visibleIds.length}
                        onChange={toggleAll}
                        aria-label={t("requirement_grid.data.select_row")}
                        containerClassName={cn(
                          "pointer-events-none opacity-0 transition-opacity group-hover/header:pointer-events-auto group-hover/header:opacity-100",
                          selectedIds.length > 0 && "pointer-events-auto opacity-100"
                        )}
                      />
                    )}
                    <RequirementGridHeaderLabel
                      icon={titleColumn?.icon}
                      label={t(titleColumn?.labelKey ?? "requirement_fields.builtin.title")}
                    />
                  </div>
                </th>
                {visibleColumns.map((key) => (
                  <th key={key} className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                    <RequirementGridHeaderLabel icon={builtinByKey[key]?.icon} label={columnLabel(key)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requirements.map((requirement) => {
                const isSelected = selectedIds.includes(requirement.id);
                return (
                  <tr
                    key={requirement.id}
                    className={cn(
                      "group/requirement",
                      REQUIREMENT_GRID_ROW_CLASS,
                      isSelected && REQUIREMENT_GRID_ROW_SELECTED_CLASS
                    )}
                  >
                    <td
                      data-requirement-sticky-cell
                      className={cn(
                        "relative",
                        REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
                        REQUIREMENT_GRID_STICKY_BODY_CLASS
                      )}
                      style={{ width: titleColumnWidth, minWidth: titleColumnWidth, maxWidth: titleColumnWidth }}
                    >
                      {/* 左固定列的底色必须不透明，所以着色铺在内层 div 而不是 <tr> 上 */}
                      <div
                        className={cn(
                          "flex h-full w-full min-w-0 items-center gap-1.5 px-page-x transition-colors duration-150 motion-reduce:transition-none",
                          isSelected
                            ? "bg-accent-primary/5 group-hover/requirement:bg-accent-primary/10"
                            : "group-hover/requirement:bg-layer-transparent-hover"
                        )}
                      >
                        {canManage && (
                          <Checkbox
                            checked={isSelected}
                            onChange={() => toggleOne(requirement.id)}
                            aria-label={t("requirement_grid.data.select_row")}
                            containerClassName={cn(
                              "pointer-events-none opacity-0 transition-opacity group-hover/requirement:pointer-events-auto group-hover/requirement:opacity-100",
                              isSelected && "pointer-events-auto opacity-100"
                            )}
                          />
                        )}
                        <Tooltip tooltipContent={requirement.title}>
                          <button
                            type="button"
                            onClick={() => onOpenDetail(requirement.id)}
                            className="min-w-0 flex-1 truncate text-left hover:text-accent-primary"
                          >
                            <BuiltinCellValue columnKey="title" values={requirement} />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                    {visibleColumns.map((key) => (
                      <td key={key} className={cn("truncate", REQUIREMENT_GRID_BODY_CELL_CLASS)}>
                        {renderCell(key, requirement)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/*
        totalCount > 0 但本页 0 行 = 停在越界的页码上。这时**必须**留着分页，
        否则唯一能回到第一页的控件也没了，用户就卡死在空页上。
      */}
      {(!isEmpty || totalCount > 0) && (
        <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
          <span className="text-sm text-secondary">
            {isLoading && <LoaderIcon className="mr-1 inline size-3.5 animate-spin" />}
            {totalCount > 0
              ? t("requirement_grid.data.range", {
                  start: currentPageOffset * perPage + 1,
                  end: Math.min(currentPageOffset * perPage + requirements.length, totalCount),
                  total: totalCount,
                })
              : ""}
          </span>
          <Pagination
            simple
            size="small"
            showSizeChanger
            pageSizeOptions={["20", "50", "100"]}
            current={currentPageOffset + 1}
            pageSize={perPage}
            total={totalCount}
            onChange={(page, size) => {
              if (size !== perPage) {
                onPerPageChange(size);
                return;
              }
              onCursorChange(`${perPage}:${page - 1}:0`);
            }}
          />
        </div>
      )}
    </div>
  );
};
