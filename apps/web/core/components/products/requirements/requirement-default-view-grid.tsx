"use client";

import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { Pagination } from "antd";
import {
  BookMarked,
  Copy,
  FolderOpenDot,
  Hash,
  History,
  Layers,
  Loader as LoaderIcon,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
} from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type {
  TRequirement,
  TRequirementData,
  TRequirementField,
  TRequirementFilter,
  TRequirementItemStatus,
  TRequirementTypeSchema,
} from "@plane/types";
import { AlertModalCore, CustomMenu, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import {
  collectRequirementGridFilterFields,
  useRequirementGridFilter,
  useRequirementGridFiltersConfig,
} from "@/components/requirements/filters";
import { BuiltinCellValue } from "@/components/requirements/requirement-builtin-fields";
import {
  REQUIREMENT_BUILTIN_TITLE_COLUMN,
  resolveBuiltinColumns,
} from "@/components/requirements/requirement-builtin-layout";
import { RequirementDisplayProperties } from "@/components/requirements/requirement-display-properties";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import { RequirementApprovalCell } from "./approval/requirement-approval-cell";
import {
  getCurrentPageOffset,
  getRequirementColumnWidth,
  MenuRowLabel,
  REQUIREMENT_GRID_BODY_CELL_CLASS,
  REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
  REQUIREMENT_GRID_COLUMN_WIDTH,
  REQUIREMENT_GRID_HEADER_CELL_CLASS,
  REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS,
  REQUIREMENT_GRID_ROW_CLASS,
  REQUIREMENT_GRID_ROW_SELECTED_CLASS,
  REQUIREMENT_GRID_SELECT_HOST_PAD_CLASS,
  REQUIREMENT_GRID_STICKY_BODY_CLASS,
  REQUIREMENT_GRID_STICKY_HEADER_CLASS,
  RequirementGridColumnResizer,
  RequirementGridHoverSelect,
  RequirementGridHeaderLabel,
  resolveRequirementTitleColumnWidth,
  useRequirementGridColumnResize,
  useRequirementGridScrollContainer,
} from "@/components/requirements/requirement-grid-shared";
import { RequirementBulkOperationsBar } from "@/components/requirements/requirement-bulk-operations-bar";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { copyRequirementData } from "@/components/requirements/requirement-row-data";
import { RequirementStatusCell } from "@/components/requirements/requirement-status-cell";
import { useRequirementTitles } from "@/components/requirements/use-requirement-titles";

/**
 * 多类型时的默认视图：跨全部需求类型的总览。
 *
 * 只展示每行都有的八个内置字段，外加一列「所属类型」—— 自定义字段随类型而异，跨类型
 * 摆在一张表里对不上列。刻意做成只读：总览里新增一行，对应类型的必填字段无处可填；
 * 要录入或改值就点进对应的类型视图。唯一例外是状态列 —— 它不是「内容」，走独立的
 * 状态端点，总览里就地可改。
 *
 * 表格骨架照搬工作项的电子表格布局（issues/issue-layouts/spreadsheet）：
 * 编号、标题依次左固定，标题列吃掉容器剩余宽度；其余列定宽 144px、行高 44px。
 * 勾选叠在首列上，不占独立格子，行操作折进标题格，悬停才显形。量化与样式常量都在
 * requirement-grid-shared.tsx，三个需求网格共用。
 */
type TProps = {
  /** 父项列要把 UUID 换成标题，跨页的父项得回头查接口 */
  workspaceSlug: string;
  productId: string;
  requirementTypes: TRequirementTypeSchema[];
  requirements: TRequirement[];
  totalCount: number;
  perPage: number;
  nextCursor?: string;
  prevCursor?: string;
  nextPageResults?: boolean;
  prevPageResults?: boolean;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  readOnly?: boolean;
  /** 基线快照没有搜索 / 筛选接口，整排工具栏都不渲染 */
  hideToolbar?: boolean;
  /** 父项标题只在当前页解析，不 ids= 去拉活需求 */
  skipRemoteParentTitles?: boolean;
  emptyText?: string;
  search: string;
  filters?: TRequirementFilter[];
  onSearchChange: (value: string) => void;
  onFiltersChange?: (value: TRequirementFilter[]) => void;
  onCursorChange: (value: string | undefined) => void;
  onPerPageChange: (value: number) => void;
  onDelete: (ids: string[]) => Promise<unknown>;
  /** 复制一行：新行绑定同一个类型，插在原行后面 */
  onDuplicate: (payload: { requirementTypeId: string; data: TRequirementData; afterId: string }) => Promise<unknown>;
  /** 不传则类型列只显示名称，不跳进类型视图 */
  onOpenRequirementTypeView?: (requirementTypeId: string) => void;
  /** 打开这一行的详情 */
  onOpenDetail: (requirementId: string) => void;
  /** 审批列上的待审胶囊点进去看那张变更单 */
  onOpenChangeRequest?: (changeRequestId: string) => void;
  /** 提交 1..N 条需求进入评审。默认视图是唯一能组装跨需求类型变更单的地方 */
  onSubmitReview?: (requirementIds: string[]) => void;
  onWithdrawReview?: (changeRequestId: string) => void;
  /**
   * 改需求级交付状态。总览虽然是只读视图，状态是唯一例外 —— 它不属于「对应类型才能填
   * 的内容」，走独立的状态端点；不传则状态格只读。
   */
  onStatusChange?: (requirementId: string, status: TRequirementItemStatus) => void;
  /** 与类型视图共用顶部工具栏容器：切视图时右上角不该整排控件消失 */
  toolbarPortalEl?: HTMLElement | null;
};

export const RequirementDefaultViewGrid = observer(function RequirementDefaultViewGrid(props: TProps) {
  const {
    workspaceSlug,
    productId,
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
    readOnly = false,
    hideToolbar = false,
    skipRemoteParentTitles = false,
    emptyText,
    search,
    filters = [],
    onSearchChange,
    onFiltersChange,
    onCursorChange,
    onPerPageChange,
    onDelete,
    onDuplicate,
    onOpenRequirementTypeView,
    onOpenDetail,
    onOpenChangeRequest,
    onSubmitReview,
    onWithdrawReview,
    onStatusChange,
    toolbarPortalEl,
  } = props;
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** 待确认删除的行；非空即弹确认框，批量与单行共用同一条链路 */
  const [idsToDelete, setIdsToDelete] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState(search);
  const [isSearchOpen, setIsSearchOpen] = useState(() => search.trim().length > 0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  /**
   * 行菜单要 portal 出滚动容器：标题列 sticky 会自建层叠上下文，菜单若留在格内会被
   * 下面几行的 sticky 格盖住（和工作项电子表格同一套修法）。
   */
  const [menuPortalEl, setMenuPortalEl] = useState<HTMLDivElement | null>(null);

  const storageKey = `requirement:columns:${workspaceSlug}:${productId}:default`;
  const [hiddenFieldIds, setHiddenFieldIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as string[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(hiddenFieldIds));
  }, [hiddenFieldIds, storageKey]);

  // 与主网格一致的 300ms 防抖，避免每敲一个字就打一次接口
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
      if (searchInput.trim() !== "") {
        clearSearch();
      } else {
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

  const requirementTypeNames = useMemo(
    () => Object.fromEntries(requirementTypes.map((requirementType) => [requirementType.id, requirementType.name])),
    [requirementTypes]
  );
  // 与类型视图同一份内置列定义：列头、列序、列宽都不该在两个视图里各写一遍。
  // 一张表混多个需求类型，无法同时满足多份内置字段布局 —— 显式传 null 走 canonical
  // 回退顺序（内置在前），只有单类型视图（RequirementGrid）吃各自类型的布局。
  const builtinColumns = [
    REQUIREMENT_BUILTIN_TITLE_COLUMN,
    ...resolveBuiltinColumns("product", null).map((entry) => entry.column),
  ];
  /**
   * 编号 / 标题两列左固定（见下方 colgroup）：横滚时编号还在，才认得出
   * 「这是哪一行」。其余内置列跟着定宽的属性列走。
   */
  const titleColumn = builtinColumns.find((column) => column.key === "title");
  const propertyBuiltinColumns = builtinColumns.filter((column) => column.key !== "title");
  /** 描述紧跟标题；审批、状态依次插在描述之后，其余内置列跟在后面 */
  const descriptionColumn = propertyBuiltinColumns.find((column) => column.key === "description_html");
  const statusColumn = propertyBuiltinColumns.find((column) => column.key === "status");
  const remainingBuiltinColumns = propertyBuiltinColumns.filter(
    (column) => column.key !== "description_html" && column.key !== "status"
  );

  const displayColumns = useMemo(
    () => [
      { id: "display_id", name: t("requirements.identifier.column") },
      { id: "module", name: t("requirement_modules.column") },
      { id: "description_html", name: t("requirement_fields.builtin.description") },
      { id: "approval", name: t("requirement_approval.column") },
      { id: "status", name: t("requirement_fields.builtin.status") },
      { id: "priority", name: t("requirement_fields.builtin.priority") },
      { id: "assignee_id", name: t("requirement_fields.builtin.assignee") },
      { id: "start_date", name: t("requirement_fields.builtin.start_date") },
      { id: "target_date", name: t("requirement_fields.builtin.target_date") },
      { id: "parent_id", name: t("requirement_fields.builtin.parent") },
      { id: "source_display_id", name: t("requirements.identifier.source_column") },
      { id: "requirement_type", name: t("workspace_products.requirements.data.views.requirement_type_column") },
    ],
    [t]
  );

  const isDisplayIdVisible = !hiddenFieldIds.includes("display_id");
  const isModuleVisible = !hiddenFieldIds.includes("module");
  const isSourceDisplayIdVisible = !hiddenFieldIds.includes("source_display_id");
  const isDescriptionVisible = !hiddenFieldIds.includes("description_html");
  const isApprovalVisible = !hiddenFieldIds.includes("approval");
  const isStatusVisible = !hiddenFieldIds.includes("status");
  const isRequirementTypeVisible = !hiddenFieldIds.includes("requirement_type");

  const customFilterFields = useMemo(() => {
    const seenFieldIds = new Set<string>();
    const fields: TRequirementField[] = [];
    for (const requirementType of requirementTypes) {
      for (const field of collectRequirementGridFilterFields(requirementType.fields)) {
        if (seenFieldIds.has(field.id)) continue;
        seenFieldIds.add(field.id);
        fields.push(field);
      }
    }
    return fields;
  }, [requirementTypes]);
  const { configs: filterConfigs, areAllConfigsInitialized } = useRequirementGridFiltersConfig({
    workspaceSlug,
    entityKind: "product",
    customFields: customFilterFields,
  });
  const filter = useRequirementGridFilter({
    areAllConfigsInitialized,
    configs: filterConfigs,
    initialFilters: filters,
    instanceKey: `${workspaceSlug}:${productId}:default`,
    onFiltersChange,
  });
  const toggleDisplayColumn = (id: string) =>
    setHiddenFieldIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const { setScrollContainer, containerWidth } = useRequirementGridScrollContainer();
  const { getWidth, startResize } = useRequirementGridColumnResize();

  const showSelectColumn = !readOnly;
  const selectHost = !showSelectColumn
    ? null
    : isDisplayIdVisible
      ? "display_id"
      : isModuleVisible
        ? "module"
        : "title";
  /** 标题列之外的所有列默认宽，用来反推标题列该吃掉多少 */
  const defaultPropertyColumnsWidth =
    (isDisplayIdVisible ? REQUIREMENT_GRID_COLUMN_WIDTH : 0) +
    (isModuleVisible ? REQUIREMENT_GRID_COLUMN_WIDTH : 0) +
    (isSourceDisplayIdVisible ? REQUIREMENT_GRID_COLUMN_WIDTH : 0) +
    (isApprovalVisible ? REQUIREMENT_GRID_COLUMN_WIDTH : 0) +
    (isDescriptionVisible ? getRequirementColumnWidth("description_html") : 0) +
    (!hiddenFieldIds.includes("status") ? getRequirementColumnWidth("status") : 0) +
    propertyBuiltinColumns
      .filter((column) => column.key !== "description_html" && column.key !== "status")
      .reduce(
        (total, column) =>
          !hiddenFieldIds.includes(column.key) ? total + getRequirementColumnWidth(column.key) : total,
        0
      ) +
    (isRequirementTypeVisible ? REQUIREMENT_GRID_COLUMN_WIDTH : 0);

  const defaultTitleColumnWidth = resolveRequirementTitleColumnWidth(containerWidth, defaultPropertyColumnsWidth);
  const columnSnapshot = useMemo(() => {
    const snapshot: Record<string, number> = {
      title: defaultTitleColumnWidth,
    };
    if (isDisplayIdVisible) snapshot.display_id = REQUIREMENT_GRID_COLUMN_WIDTH;
    if (isModuleVisible) snapshot.module = REQUIREMENT_GRID_COLUMN_WIDTH;
    if (isSourceDisplayIdVisible) snapshot.source_display_id = REQUIREMENT_GRID_COLUMN_WIDTH;
    if (isApprovalVisible) snapshot.approval = REQUIREMENT_GRID_COLUMN_WIDTH;
    if (isRequirementTypeVisible) snapshot.requirement_type = REQUIREMENT_GRID_COLUMN_WIDTH;
    propertyBuiltinColumns.forEach((column) => {
      if (!hiddenFieldIds.includes(column.key)) {
        snapshot[column.key] = getRequirementColumnWidth(column.key);
      }
    });
    return snapshot;
  }, [
    defaultTitleColumnWidth,
    hiddenFieldIds,
    isApprovalVisible,
    isDisplayIdVisible,
    isModuleVisible,
    isRequirementTypeVisible,
    isSourceDisplayIdVisible,
    propertyBuiltinColumns,
  ]);
  const titleColumnWidth = getWidth("title", defaultTitleColumnWidth);
  const displayIdWidth = getWidth("display_id", REQUIREMENT_GRID_COLUMN_WIDTH);
  const moduleWidth = getWidth("module", REQUIREMENT_GRID_COLUMN_WIDTH);
  const sourceDisplayIdWidth = getWidth("source_display_id", REQUIREMENT_GRID_COLUMN_WIDTH);
  const displayIdStickyLeft = 0;
  // 模块列插在编号与标题之间，同为左固定，offset 逐列累加
  const moduleStickyLeft = isDisplayIdVisible ? displayIdWidth : 0;
  const titleStickyLeft = (isDisplayIdVisible ? displayIdWidth : 0) + (isModuleVisible ? moduleWidth : 0);
  const propertyColumnsWidth =
    (isDisplayIdVisible ? displayIdWidth : 0) +
    (isModuleVisible ? moduleWidth : 0) +
    (isSourceDisplayIdVisible ? sourceDisplayIdWidth : 0) +
    (isApprovalVisible ? getWidth("approval", REQUIREMENT_GRID_COLUMN_WIDTH) : 0) +
    (isDescriptionVisible && descriptionColumn
      ? getWidth(descriptionColumn.key, getRequirementColumnWidth(descriptionColumn.key))
      : 0) +
    (!hiddenFieldIds.includes("status") && statusColumn
      ? getWidth(statusColumn.key, getRequirementColumnWidth(statusColumn.key))
      : 0) +
    remainingBuiltinColumns.reduce(
      (total, column) =>
        !hiddenFieldIds.includes(column.key)
          ? total + getWidth(column.key, getRequirementColumnWidth(column.key))
          : total,
      0
    ) +
    (isRequirementTypeVisible ? getWidth("requirement_type", REQUIREMENT_GRID_COLUMN_WIDTH) : 0);
  const tableWidth = titleColumnWidth + propertyColumnsWidth;
  // 父项列存的是 UUID，页内命中不发请求，跨页父项攒成一次批量取
  const parentTitles = useRequirementTitles({
    workspaceSlug,
    entityKind: "product",
    entityId: productId,
    knownRows: requirements,
    parentIds: useMemo(() => requirements.map((requirement) => requirement.parent_id), [requirements]),
    skipRemote: skipRemoteParentTitles,
  });
  const resolveParentTitle = useCallback((parentId: string) => parentTitles[parentId], [parentTitles]);
  const currentPageOffset = getCurrentPageOffset(prevCursor, nextCursor, prevPageResults, nextPageResults);
  const visibleIds = requirements.map((requirement) => requirement.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  /**
   * 勾选会跨页保留；can_submit_review 只随当前页数据下发。
   * 翻页后旧行不在 requirements 里，若当场 find 会把可提交数算成 0，提交按钮被藏掉。
   * 用已见过的行缓存判断，删除则本来就按 selectedIds，两边一致。
   */
  const canSubmitReviewByIdRef = useRef<Map<string, boolean>>(new Map());
  for (const item of requirements) {
    canSubmitReviewByIdRef.current.set(item.id, Boolean(item.can_submit_review));
  }
  /** 可提交的选中行。撤回不做批量 —— 撤回作用在变更单上，一个选区可能跨多张单 */
  const submittableSelectedIds = useMemo(
    () => selectedIds.filter((id) => canSubmitReviewByIdRef.current.get(id)),
    [requirements, selectedIds]
  );

  const toggleAll = () => setSelectedIds(allSelected ? [] : visibleIds);
  const toggleOne = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  /**
   * 删除一律走二次确认。
   *
   * 主网格的删除是「暂存 + 保存更改」的两步，本身就有反悔余地；这里是点一下就直接
   * 打接口，没有撤销，所以必须挡一道 —— 与类型列表等其他删除入口的 AlertModalCore
   * 保持一致。
   */
  const confirmDelete = async () => {
    if (!idsToDelete.length) return;
    await onDelete(idsToDelete);
    setSelectedIds((current) => current.filter((id) => !idsToDelete.includes(id)));
    setIdsToDelete([]);
  };

  /**
   * 复制一行。走 copyRequirementDetailData 而不是直接深拷贝 —— 它会给子表单的每一行
   * 重新分配 UUID，否则新旧两行的表单行 ID 会撞在一起。
   */
  const handleDuplicate = (requirement: TRequirement) => {
    const fields =
      requirementTypes.find((requirementType) => requirementType.id === requirement.requirement_type_id)?.fields ?? [];
    return onDuplicate({
      requirementTypeId: requirement.requirement_type_id,
      data: copyRequirementData(requirement.data, fields),
      afterId: requirement.id,
    });
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
        <p className="text-13 text-secondary">{error}</p>
      </div>
    );
  }

  const toolbar = (
    <div className="flex items-center gap-2">
      <div className="flex items-center">
        {!isSearchOpen && (
          <IconButton
            variant="ghost"
            size="lg"
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
            {
              "w-30 border-subtle px-2.5 opacity-100 md:w-64": isSearchOpen,
            }
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
      <FiltersToggle filter={filter} />
      <FiltersDropdown title={t("common.display")} placement="bottom-end">
        <RequirementDisplayProperties
          columns={displayColumns}
          hiddenIds={hiddenFieldIds}
          onToggle={toggleDisplayColumn}
        />
      </FiltersDropdown>
    </div>
  );

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div ref={setMenuPortalEl} className="requirement-grid-menu-portal" />
      {!hideToolbar &&
        (toolbarPortalEl ? (
          createPortal(toolbar, toolbarPortalEl)
        ) : (
          <div className="relative z-20 px-4 py-2">{toolbar}</div>
        ))}

      {!hideToolbar && <FiltersRow filter={filter} />}

      {/*
        min-w-0：列方向 flex 子项默认 min-width:auto，会被定宽表格撑到整表宽度，父级再
        overflow-hidden 裁掉——表现就是「右边列被切掉、容器自身却滚不动」。压到 0 后
        宽度才受容器约束，overflow-auto 才能出横向滚动条。
      */}
      <div
        ref={setScrollContainer}
        className="horizontal-scrollbar vertical-scrollbar scrollbar-lg min-h-0 min-w-0 flex-1 overflow-auto bg-surface-1"
      >
        {/*
          列宽全部显式给定（table-fixed + colgroup）：编号、标题两列左固定，
          标题列吃掉容器剩余宽度，其余列一律定宽。这样表格恒好铺满容器
          —— 既不会短一截露出背景，也不会因为定宽相加超出而把最右边的列（「所属
          类型」正是总览视图的立身之本）挤到屏幕外。放不下时整表横滚，前两列留在原地。
        */}
        <table className="table-fixed border-collapse bg-surface-1 text-left text-13" style={{ width: tableWidth }}>
          <colgroup>
            {isDisplayIdVisible && <col style={{ width: displayIdWidth }} />}
            {isModuleVisible && <col style={{ width: moduleWidth }} />}
            <col style={{ width: titleColumnWidth }} />
            {isDescriptionVisible && descriptionColumn && (
              <col
                style={{ width: getWidth(descriptionColumn.key, getRequirementColumnWidth(descriptionColumn.key)) }}
              />
            )}
            {isApprovalVisible && <col style={{ width: getWidth("approval", REQUIREMENT_GRID_COLUMN_WIDTH) }} />}
            {!hiddenFieldIds.includes("status") && statusColumn && (
              <col style={{ width: getWidth(statusColumn.key, getRequirementColumnWidth(statusColumn.key)) }} />
            )}
            {remainingBuiltinColumns.map((column) =>
              !hiddenFieldIds.includes(column.key) ? (
                <col key={column.key} style={{ width: getWidth(column.key, getRequirementColumnWidth(column.key)) }} />
              ) : null
            )}
            {isSourceDisplayIdVisible && <col style={{ width: sourceDisplayIdWidth }} />}
            {isRequirementTypeVisible && (
              <col style={{ width: getWidth("requirement_type", REQUIREMENT_GRID_COLUMN_WIDTH) }} />
            )}
          </colgroup>
          <thead className="sticky top-0 z-[12] border-b border-subtle text-13 font-medium">
            <tr>
              {isDisplayIdVisible && (
                <th
                  className={cn(
                    "group/header relative",
                    REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS,
                    REQUIREMENT_GRID_STICKY_HEADER_CLASS
                  )}
                  style={{
                    width: displayIdWidth,
                    minWidth: displayIdWidth,
                    maxWidth: displayIdWidth,
                    left: displayIdStickyLeft,
                  }}
                >
                  <div
                    className={cn(
                      "flex h-full w-full min-w-0 items-center gap-1.5",
                      selectHost === "display_id" ? REQUIREMENT_GRID_SELECT_HOST_PAD_CLASS : "px-page-x"
                    )}
                  >
                    <RequirementGridHeaderLabel icon={Hash} label={t("requirements.identifier.column")} />
                  </div>
                  {selectHost === "display_id" && (
                    <RequirementGridHoverSelect
                      checked={allSelected}
                      indeterminate={!allSelected && selectedIds.length > 0}
                      disabled={!visibleIds.length}
                      onChange={toggleAll}
                      ariaLabel={t("requirement_grid.data.select_row")}
                      hoverGroup="header"
                      forceVisible={selectedIds.length > 0}
                    />
                  )}
                  <RequirementGridColumnResizer
                    onMouseDown={(event) => startResize("display_id", columnSnapshot, event)}
                  />
                </th>
              )}
              {isModuleVisible && (
                <th
                  className={cn(
                    "group/header relative",
                    REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS,
                    REQUIREMENT_GRID_STICKY_HEADER_CLASS
                  )}
                  style={{
                    width: moduleWidth,
                    minWidth: moduleWidth,
                    maxWidth: moduleWidth,
                    left: moduleStickyLeft,
                  }}
                >
                  <div
                    className={cn(
                      "flex h-full w-full min-w-0 items-center gap-1.5",
                      selectHost === "module" ? REQUIREMENT_GRID_SELECT_HOST_PAD_CLASS : "px-page-x"
                    )}
                  >
                    <RequirementGridHeaderLabel icon={FolderOpenDot} label={t("requirement_modules.column")} />
                  </div>
                  {selectHost === "module" && (
                    <RequirementGridHoverSelect
                      checked={allSelected}
                      indeterminate={!allSelected && selectedIds.length > 0}
                      disabled={!visibleIds.length}
                      onChange={toggleAll}
                      ariaLabel={t("requirement_grid.data.select_row")}
                      hoverGroup="header"
                      forceVisible={selectedIds.length > 0}
                    />
                  )}
                  <RequirementGridColumnResizer onMouseDown={(event) => startResize("module", columnSnapshot, event)} />
                </th>
              )}
              <th
                data-requirement-sticky-cell
                className={cn(
                  "group/header relative",
                  REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS,
                  REQUIREMENT_GRID_STICKY_HEADER_CLASS
                )}
                style={{
                  width: titleColumnWidth,
                  minWidth: titleColumnWidth,
                  maxWidth: titleColumnWidth,
                  left: titleStickyLeft,
                }}
              >
                <div
                  className={cn(
                    "flex h-full w-full min-w-0 items-center gap-1.5",
                    selectHost === "title" ? REQUIREMENT_GRID_SELECT_HOST_PAD_CLASS : "px-page-x"
                  )}
                >
                  <RequirementGridHeaderLabel
                    icon={titleColumn?.icon}
                    label={t(titleColumn?.labelKey ?? "requirement_fields.builtin.title")}
                  />
                </div>
                {selectHost === "title" && (
                  <RequirementGridHoverSelect
                    checked={allSelected}
                    indeterminate={!allSelected && selectedIds.length > 0}
                    disabled={!visibleIds.length}
                    onChange={toggleAll}
                    ariaLabel={t("requirement_grid.data.select_row")}
                    hoverGroup="header"
                    forceVisible={selectedIds.length > 0}
                  />
                )}
                <RequirementGridColumnResizer onMouseDown={(event) => startResize("title", columnSnapshot, event)} />
              </th>
              {isDescriptionVisible && descriptionColumn && (
                <th className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                  <RequirementGridHeaderLabel icon={descriptionColumn.icon} label={t(descriptionColumn.labelKey)} />
                  <RequirementGridColumnResizer
                    onMouseDown={(event) => startResize(descriptionColumn.key, columnSnapshot, event)}
                  />
                </th>
              )}
              {/* 审批紧跟描述：每行都要扫一眼，不能放到要横滚才看得见的地方 */}
              {isApprovalVisible && (
                <th className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                  <RequirementGridHeaderLabel icon={ShieldCheck} label={t("requirement_approval.column")} />
                  <RequirementGridColumnResizer
                    onMouseDown={(event) => startResize("approval", columnSnapshot, event)}
                  />
                </th>
              )}
              {/* 状态紧跟审批：需求级交付状态（人工维护），同样是逐行要扫的信号 */}
              {!hiddenFieldIds.includes("status") && statusColumn && (
                <th className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                  <RequirementGridHeaderLabel icon={statusColumn.icon} label={t(statusColumn.labelKey)} />
                  <RequirementGridColumnResizer
                    onMouseDown={(event) => startResize(statusColumn.key, columnSnapshot, event)}
                  />
                </th>
              )}
              {remainingBuiltinColumns.map((column) =>
                !hiddenFieldIds.includes(column.key) ? (
                  <th key={column.key} className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                    <RequirementGridHeaderLabel icon={column.icon} label={t(column.labelKey)} />
                    <RequirementGridColumnResizer
                      onMouseDown={(event) => startResize(column.key, columnSnapshot, event)}
                    />
                  </th>
                ) : null
              )}
              {/* 标准库编号排在末尾：只在追溯标准库来源时才看，不该占着靠前的位置 */}
              {isSourceDisplayIdVisible && (
                <th className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                  <RequirementGridHeaderLabel icon={BookMarked} label={t("requirements.identifier.source_column")} />
                  <RequirementGridColumnResizer
                    onMouseDown={(event) => startResize("source_display_id", columnSnapshot, event)}
                  />
                </th>
              )}
              {isRequirementTypeVisible && (
                <th className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                  <RequirementGridHeaderLabel
                    icon={Layers}
                    label={t("workspace_products.requirements.data.views.requirement_type_column")}
                  />
                  <RequirementGridColumnResizer
                    onMouseDown={(event) => startResize("requirement_type", columnSnapshot, event)}
                  />
                </th>
              )}
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
                  {/*
                    编号 / 标题依次左固定。勾选叠在首列，行操作仍折进标题列。
                    左固定列底色必须不透明，选中/悬停着色铺在内层 div。
                  */}
                  {isDisplayIdVisible && (
                    <td
                      className={cn(
                        "relative",
                        REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
                        REQUIREMENT_GRID_STICKY_BODY_CLASS
                      )}
                      style={{
                        width: displayIdWidth,
                        minWidth: displayIdWidth,
                        maxWidth: displayIdWidth,
                        left: displayIdStickyLeft,
                      }}
                    >
                      <div
                        className={cn(
                          "flex h-full w-full min-w-0 items-center gap-1.5 transition-colors duration-150 motion-reduce:transition-none",
                          selectHost === "display_id" ? REQUIREMENT_GRID_SELECT_HOST_PAD_CLASS : "px-page-x",
                          isSelected
                            ? "bg-accent-primary/5 group-hover/requirement:bg-accent-primary/10"
                            : "group-hover/requirement:bg-layer-transparent-hover"
                        )}
                      >
                        {requirement.display_id ? (
                          <button
                            type="button"
                            onClick={() => onOpenDetail(requirement.id)}
                            className="min-w-0 truncate text-left hover:text-accent-primary"
                          >
                            <RequirementIdentifier displayId={requirement.display_id} />
                          </button>
                        ) : (
                          <span className="text-placeholder">—</span>
                        )}
                      </div>
                      {selectHost === "display_id" && (
                        <RequirementGridHoverSelect
                          checked={isSelected}
                          onChange={() => toggleOne(requirement.id)}
                          ariaLabel={t("requirement_grid.data.select_row")}
                          hoverGroup="requirement"
                        />
                      )}
                    </td>
                  )}
                  {/* 模块列：紧跟编号，只读展示（挂靠走左侧树 / 批量移动） */}
                  {isModuleVisible && (
                    <td
                      className={cn(
                        "relative",
                        REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
                        REQUIREMENT_GRID_STICKY_BODY_CLASS
                      )}
                      style={{
                        width: moduleWidth,
                        minWidth: moduleWidth,
                        maxWidth: moduleWidth,
                        left: moduleStickyLeft,
                      }}
                    >
                      <div
                        className={cn(
                          "flex h-full w-full min-w-0 items-center transition-colors duration-150 motion-reduce:transition-none",
                          selectHost === "module" ? REQUIREMENT_GRID_SELECT_HOST_PAD_CLASS : "px-page-x",
                          isSelected
                            ? "bg-accent-primary/5 group-hover/requirement:bg-accent-primary/10"
                            : "group-hover/requirement:bg-layer-transparent-hover"
                        )}
                      >
                        {requirement.module_name ? (
                          <span className="min-w-0 truncate" title={requirement.module_name}>
                            {requirement.module_name}
                          </span>
                        ) : (
                          <span className="text-placeholder">—</span>
                        )}
                      </div>
                      {selectHost === "module" && (
                        <RequirementGridHoverSelect
                          checked={isSelected}
                          onChange={() => toggleOne(requirement.id)}
                          ariaLabel={t("requirement_grid.data.select_row")}
                          hoverGroup="requirement"
                        />
                      )}
                    </td>
                  )}
                  <td
                    data-requirement-sticky-cell
                    className={cn(
                      "relative",
                      REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
                      REQUIREMENT_GRID_STICKY_BODY_CLASS
                    )}
                    style={{
                      width: titleColumnWidth,
                      minWidth: titleColumnWidth,
                      maxWidth: titleColumnWidth,
                      left: titleStickyLeft,
                    }}
                  >
                    <div
                      className={cn(
                          "flex h-full w-full min-w-0 items-center gap-1.5 transition-colors duration-150 motion-reduce:transition-none",
                          selectHost === "title" ? REQUIREMENT_GRID_SELECT_HOST_PAD_CLASS : "px-page-x",
                          isSelected
                            ? "bg-accent-primary/5 group-hover/requirement:bg-accent-primary/10"
                            : "group-hover/requirement:bg-layer-transparent-hover"
                        )}
                      >
                      {selectHost === "title" && (
                        <RequirementGridHoverSelect
                          checked={isSelected}
                          onChange={() => toggleOne(requirement.id)}
                          ariaLabel={t("requirement_grid.data.select_row")}
                          hoverGroup="requirement"
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
                      {!readOnly && (
                        <span className="shrink-0 opacity-0 transition-opacity group-hover/requirement:opacity-100 focus-within:opacity-100">
                          {/* 总览视图只给复制与删除：改字段值要回到对应的类型视图 */}
                          <CustomMenu
                            ellipsis
                            placement="bottom-end"
                            buttonClassName="text-tertiary hover:text-primary"
                            portalElement={menuPortalEl}
                          >
                            <CustomMenu.MenuItem
                              onClick={() => void handleDuplicate(requirement)}
                              disabled={isMutating}
                            >
                              <MenuRowLabel icon={Copy} label={t("requirement_grid.data.copy")} />
                            </CustomMenu.MenuItem>
                            {requirement.can_submit_review && onSubmitReview && (
                              <CustomMenu.MenuItem onClick={() => onSubmitReview([requirement.id])}>
                                <MenuRowLabel icon={Send} label={t("requirement_approval.submit_review")} />
                              </CustomMenu.MenuItem>
                            )}
                            {requirement.can_withdraw && requirement.pending_change_request_id && onWithdrawReview && (
                              <CustomMenu.MenuItem
                                onClick={() => onWithdrawReview(requirement.pending_change_request_id as string)}
                              >
                                <MenuRowLabel icon={Undo2} label={t("requirement_approval.withdraw_review")} />
                              </CustomMenu.MenuItem>
                            )}
                            {requirement.pending_change_request_id && onOpenChangeRequest && (
                              <CustomMenu.MenuItem
                                onClick={() => onOpenChangeRequest(requirement.pending_change_request_id as string)}
                              >
                                <MenuRowLabel icon={History} label={t("requirement_approval.view_change_request")} />
                              </CustomMenu.MenuItem>
                            )}
                            {/* 评审中的行不能删；已通过审批的删除要走评审，所以文案变成「申请删除」 */}
                            {!requirement.is_locked && (
                              <CustomMenu.MenuItem
                                onClick={() => {
                                  if (requirement.approved_version !== null && onSubmitReview) {
                                    onSubmitReview([requirement.id]);
                                    return;
                                  }
                                  setIdsToDelete([requirement.id]);
                                }}
                                disabled={isMutating}
                              >
                                <MenuRowLabel
                                  icon={Trash2}
                                  label={
                                    requirement.approved_version !== null
                                      ? t("requirement_approval.request_delete")
                                      : t("delete")
                                  }
                                  tone={requirement.approved_version !== null ? undefined : "danger"}
                                />
                              </CustomMenu.MenuItem>
                            )}
                          </CustomMenu>
                        </span>
                      )}
                    </div>
                  </td>
                  {/* 总览列一律单行截断：描述是富文本，长短不一会把行高拉得参差不齐 */}
                  {isDescriptionVisible && descriptionColumn && (
                    <td className={cn("truncate text-secondary", REQUIREMENT_GRID_BODY_CELL_CLASS)}>
                      <BuiltinCellValue
                        columnKey={descriptionColumn.key}
                        values={requirement}
                        resolveParentTitle={resolveParentTitle}
                      />
                    </td>
                  )}
                  {isApprovalVisible && (
                    <td className={REQUIREMENT_GRID_BODY_CELL_CLASS}>
                      <RequirementApprovalCell requirement={requirement} onOpenChangeRequest={onOpenChangeRequest} />
                    </td>
                  )}
                  {!hiddenFieldIds.includes("status") && statusColumn && (
                    <td className={REQUIREMENT_GRID_BODY_CELL_CLASS}>
                      {/*
                        总览只读，状态格是唯一能改的格：它不跟行级 is_locked / closed 走
                        （closed 行要能重开、评审中也能改状态），只看页面级写权限
                      */}
                      <RequirementStatusCell
                        status={requirement.status}
                        onChange={
                          !readOnly && onStatusChange ? (status) => onStatusChange(requirement.id, status) : undefined
                        }
                      />
                    </td>
                  )}
                  {remainingBuiltinColumns.map((column) =>
                    !hiddenFieldIds.includes(column.key) ? (
                      <td key={column.key} className={cn("truncate", REQUIREMENT_GRID_BODY_CELL_CLASS)}>
                        <BuiltinCellValue
                          columnKey={column.key}
                          values={requirement}
                          resolveParentTitle={resolveParentTitle}
                        />
                      </td>
                    ) : null
                  )}
                  {isSourceDisplayIdVisible && (
                    <td className={cn("truncate", REQUIREMENT_GRID_BODY_CELL_CLASS)}>
                      {requirement.source_display_id ? (
                        <RequirementIdentifier displayId={requirement.source_display_id} />
                      ) : (
                        <span className="text-placeholder">—</span>
                      )}
                    </td>
                  )}
                  {isRequirementTypeVisible && (
                    <td className={REQUIREMENT_GRID_BODY_CELL_CLASS}>
                      {onOpenRequirementTypeView ? (
                        <button
                          type="button"
                          onClick={() => onOpenRequirementTypeView(requirement.requirement_type_id)}
                          title={t("workspace_products.requirements.data.views.open_requirement_type_view", {
                            name: requirementTypeNames[requirement.requirement_type_id] ?? "",
                          })}
                          className={cn(
                            "inline-flex max-w-full items-center rounded-md bg-layer-2 px-2 py-0.5 text-12",
                            "text-secondary transition-colors hover:bg-layer-3 hover:text-primary"
                          )}
                        >
                          <span className="truncate">
                            {requirementTypeNames[requirement.requirement_type_id] ?? "—"}
                          </span>
                        </button>
                      ) : (
                        <span className="inline-flex max-w-full items-center rounded-md bg-layer-2 px-2 py-0.5 text-12 text-secondary">
                          <span className="truncate">
                            {requirementTypeNames[requirement.requirement_type_id] ?? "—"}
                          </span>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!requirements.length && (
          <div className="grid place-items-center p-10 text-center">
            <p className="text-13 text-secondary">
              {emptyText ?? t("workspace_products.requirements.data.views.empty")}
            </p>
          </div>
        )}
      </div>

      <div className="relative shrink-0">
        {!readOnly && (
          <RequirementBulkOperationsBar
            selectedCount={selectedIds.length}
            disabled={isMutating}
            onClearSelection={() => setSelectedIds([])}
            submitReviewCount={submittableSelectedIds.length}
            onSubmitReview={onSubmitReview ? () => onSubmitReview(submittableSelectedIds) : undefined}
            onDelete={() => setIdsToDelete(selectedIds)}
          />
        )}
        <div className="flex items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
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
      </div>

      <AlertModalCore
        isOpen={idsToDelete.length > 0}
        isSubmitting={isMutating}
        handleClose={() => setIdsToDelete([])}
        handleSubmit={() => void confirmDelete()}
        title={t(
          idsToDelete.length > 1
            ? "workspace_products.requirements.data.views.delete_many_title"
            : "workspace_products.requirements.data.views.delete_one_title"
        )}
        content={t(
          idsToDelete.length > 1
            ? "workspace_products.requirements.data.views.delete_many_description"
            : "workspace_products.requirements.data.views.delete_one_description",
          { count: idsToDelete.length }
        )}
        // AlertModalCore 的按钮默认是英文硬编码，本功能里的 version-history 也是显式传的
        primaryButtonText={{ default: t("delete"), loading: t("deleting") }}
        secondaryButtonText={t("cancel")}
      />
    </div>
  );
});
