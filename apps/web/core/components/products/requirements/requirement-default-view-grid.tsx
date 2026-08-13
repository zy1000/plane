"use client";

import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pagination } from "antd";
import {
  BookMarked,
  Copy,
  FolderKanban,
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
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirement, TRequirementData, TRequirementTypeSchema } from "@plane/types";
import { AlertModalCore, Checkbox, CustomMenu, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { BuiltinCellValue, getBuiltinColumnsFor } from "@/components/requirements/requirement-builtin-fields";
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
  REQUIREMENT_GRID_STICKY_BODY_CLASS,
  REQUIREMENT_GRID_STICKY_HEADER_CLASS,
  RequirementGridHeaderLabel,
  resolveRequirementTitleColumnWidth,
  useRequirementGridScrollContainer,
} from "@/components/requirements/requirement-grid-shared";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { copyRequirementData } from "@/components/requirements/requirement-row-data";
import { useRequirementTitles } from "@/components/requirements/use-requirement-titles";
import { useProductProjects } from "@/hooks/store/use-product-projects";
import { RequirementProjectStageBadges } from "./requirement-project-stage-badges";

/**
 * 多类型时的默认视图：跨全部需求类型的总览。
 *
 * 只展示每行都有的八个内置字段，外加一列「所属类型」—— 自定义字段随类型而异，跨类型
 * 摆在一张表里对不上列。刻意做成只读：总览里新增一行，对应类型的必填字段无处可填；
 * 要录入或改值就点进对应的类型视图。
 *
 * 表格骨架照搬工作项的电子表格布局（issues/issue-layouts/spreadsheet）：标题列左固定
 * 并吃掉容器剩余宽度、其余列定宽 144px、行高 44px、勾选框与行操作都折进标题格里悬停
 * 才显形。量化与样式常量都在 requirement-grid-shared.tsx，三个需求网格共用。
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
  search: string;
  onSearchChange: (value: string) => void;
  onCursorChange: (value: string | undefined) => void;
  onPerPageChange: (value: number) => void;
  onDelete: (ids: string[]) => Promise<unknown>;
  /** 复制一行：新行绑定同一个类型，插在原行后面 */
  onDuplicate: (payload: { requirementTypeId: string; data: TRequirementData; afterId: string }) => Promise<unknown>;
  onOpenRequirementTypeView: (requirementTypeId: string) => void;
  /** 打开这一行的详情 */
  onOpenDetail: (requirementId: string) => void;
  /** 审批列上的待审胶囊点进去看那张变更单 */
  onOpenChangeRequest?: (changeRequestId: string) => void;
  /** 提交 1..N 条需求进入评审。默认视图是唯一能组装跨需求类型变更单的地方 */
  onSubmitReview?: (requirementIds: string[]) => void;
  onWithdrawReview?: (changeRequestId: string) => void;
  /** 与类型视图共用顶部工具栏容器：切视图时右上角不该整排控件消失 */
  toolbarPortalEl?: HTMLElement | null;
};

export const RequirementDefaultViewGrid = (props: TProps) => {
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
    search,
    onSearchChange,
    onCursorChange,
    onPerPageChange,
    onDelete,
    onDuplicate,
    onOpenRequirementTypeView,
    onOpenDetail,
    onOpenChangeRequest,
    onSubmitReview,
    onWithdrawReview,
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
  // 与类型视图同一份内置列定义：列头、列序、列宽都不该在两个视图里各写一遍
  const builtinColumns = getBuiltinColumnsFor("product");
  /**
   * 标题列单拎出来做左固定列（见下方 colgroup）：它是唯一能认出「这是哪一行」的列，
   * 横滚时必须留在视野里。其余内置列跟着定宽的属性列走。
   */
  const titleColumn = builtinColumns.find((column) => column.key === "title");
  const propertyBuiltinColumns = builtinColumns.filter((column) => column.key !== "title");
  /** 描述紧跟标题；审批插在描述之后，其余内置列跟在审批后面 */
  const descriptionColumn = propertyBuiltinColumns.find((column) => column.key === "description_html");
  const remainingBuiltinColumns = propertyBuiltinColumns.filter((column) => column.key !== "description_html");

  const { setScrollContainer, containerWidth } = useRequirementGridScrollContainer();

  /** 标题列之外的所有列宽，用来反推标题列该吃掉多少 */
  const propertyColumnsWidth =
    // 编号 + 标准库编号 + 审批列 + 项目阶段列 + 内置属性列 + 所属类型列
    REQUIREMENT_GRID_COLUMN_WIDTH +
    REQUIREMENT_GRID_COLUMN_WIDTH +
    REQUIREMENT_GRID_COLUMN_WIDTH +
    REQUIREMENT_GRID_COLUMN_WIDTH +
    propertyBuiltinColumns.reduce((total, column) => total + getRequirementColumnWidth(column.key), 0) +
    REQUIREMENT_GRID_COLUMN_WIDTH;
  // 项目阶段列的 tooltip 要把 project_id 翻成项目名，名录与详情页「所属项目」同源
  const { links: productProjectLinks } = useProductProjects({ workspaceSlug, productId });
  const projectNameById = useMemo(
    () => new Map(productProjectLinks.map((link) => [link.project, link.project_detail?.name])),
    [productProjectLinks]
  );
  const resolveProjectName = useCallback((projectId: string) => projectNameById.get(projectId), [projectNameById]);
  const titleColumnWidth = resolveRequirementTitleColumnWidth(containerWidth, propertyColumnsWidth);
  const tableWidth = titleColumnWidth + propertyColumnsWidth;
  // 父项列存的是 UUID，页内命中不发请求，跨页父项攒成一次批量取
  const parentTitles = useRequirementTitles({
    workspaceSlug,
    entityKind: "product",
    entityId: productId,
    knownRows: requirements,
    parentIds: useMemo(() => requirements.map((requirement) => requirement.parent_id), [requirements]),
  });
  const resolveParentTitle = useCallback((parentId: string) => parentTitles[parentId], [parentTitles]);
  const currentPageOffset = getCurrentPageOffset(prevCursor, nextCursor, prevPageResults, nextPageResults);
  const visibleIds = requirements.map((requirement) => requirement.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  /** 可提交的选中行。撤回不做批量 —— 撤回作用在变更单上，一个选区可能跨多张单 */
  const submittableSelectedIds = useMemo(
    () => selectedIds.filter((id) => requirements.find((item) => item.id === id)?.can_submit_review),
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
    const fields = requirementTypes.find((requirementType) => requirementType.id === requirement.requirement_type_id)?.fields ?? [];
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
      {!readOnly && onSubmitReview && submittableSelectedIds.length > 0 && (
        <Button
          variant="primary"
          size="sm"
          disabled={isMutating}
          onClick={() => onSubmitReview(submittableSelectedIds)}
        >
          <Send className="size-3.5" />
          {t("requirement_approval.submit_review_count", { count: submittableSelectedIds.length })}
        </Button>
      )}
      {!readOnly && selectedIds.length > 0 && (
        <Button variant="error-outline" size="sm" disabled={isMutating} onClick={() => setIdsToDelete(selectedIds)}>
          <Trash2 className="size-3.5" />
          {t("workspace_products.requirements.data.views.delete_selected", { count: selectedIds.length })}
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
            "ml-auto box-border flex h-7 w-0 items-center justify-start gap-1 overflow-hidden rounded-md border border-transparent bg-surface-1 text-placeholder opacity-0 transition-[width] ease-linear",
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
    </div>
  );

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div ref={setMenuPortalEl} className="requirement-grid-menu-portal" />
      {toolbarPortalEl ? createPortal(toolbar, toolbarPortalEl) : <div className="px-4 py-2">{toolbar}</div>}

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
          列宽全部显式给定（table-fixed + colgroup），且照工作项电子表格的排法：
          标题列左固定并吃掉容器剩余宽度，其余列一律定宽。这样表格恒好铺满容器
          —— 既不会短一截露出背景，也不会因为定宽相加超出而把最右边的列（「所属
          类型」正是总览视图的立身之本）挤到屏幕外。放不下时整表横滚，标题列留在原地。
        */}
        <table
          className="table-fixed border-collapse bg-surface-1 text-left text-13"
          style={{ width: tableWidth }}
        >
          <colgroup>
            <col style={{ width: titleColumnWidth }} />
            <col style={{ width: REQUIREMENT_GRID_COLUMN_WIDTH }} />
            <col style={{ width: REQUIREMENT_GRID_COLUMN_WIDTH }} />
            {descriptionColumn && (
              <col style={{ width: getRequirementColumnWidth(descriptionColumn.key) }} />
            )}
            <col style={{ width: REQUIREMENT_GRID_COLUMN_WIDTH }} />
            <col style={{ width: REQUIREMENT_GRID_COLUMN_WIDTH }} />
            {remainingBuiltinColumns.map((column) => (
              <col key={column.key} style={{ width: getRequirementColumnWidth(column.key) }} />
            ))}
            <col style={{ width: REQUIREMENT_GRID_COLUMN_WIDTH }} />
          </colgroup>
          <thead className="sticky top-0 z-[12] border-b border-subtle text-13 font-medium">
            <tr>
              {/* 标题列：勾选框折进来，与工作项一样不单独占一列 */}
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
                  {/*
                    勾选框常驻占位、只在悬停（或已有选中）时显形 —— 与工作项一致。
                    用 opacity 而不是条件渲染，标题才不会在鼠标进出时左右跳。
                  */}
                  {!readOnly && (
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
              <th className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                <RequirementGridHeaderLabel icon={Hash} label={t("requirements.identifier.column")} />
              </th>
              <th className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                <RequirementGridHeaderLabel
                  icon={BookMarked}
                  label={t("requirements.identifier.source_column")}
                />
              </th>
              {descriptionColumn && (
                <th className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                  <RequirementGridHeaderLabel icon={descriptionColumn.icon} label={t(descriptionColumn.labelKey)} />
                </th>
              )}
              {/* 审批紧跟描述：每行都要扫一眼，不能放到要横滚才看得见的地方 */}
              <th className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                <RequirementGridHeaderLabel icon={ShieldCheck} label={t("requirement_approval.column")} />
              </th>
              {/* 项目阶段紧跟审批：关联驱动派生的交付进度，同样是逐行要扫的信号 */}
              <th className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                <RequirementGridHeaderLabel
                  icon={FolderKanban}
                  label={t("project_requirements.project_stage_column")}
                />
              </th>
              {remainingBuiltinColumns.map((column) => (
                <th key={column.key} className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                  <RequirementGridHeaderLabel icon={column.icon} label={t(column.labelKey)} />
                </th>
              ))}
              <th className={REQUIREMENT_GRID_HEADER_CELL_CLASS}>
                <RequirementGridHeaderLabel
                  icon={Layers}
                  label={t("workspace_products.requirements.data.views.requirement_type_column")}
                />
              </th>
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
                    标题格：勾选框 + 标题 + 详情入口 + 行操作菜单。除标题外都是悬停
                    才显形，静息状态下这一格只有标题，和工作项一致。

                    左固定列的底色必须不透明（否则横滚时下面的内容会透上来），所以
                    选中/悬停的着色交给内层 div 铺，而不是像其余单元格那样挂在 <tr> 上。
                  */}
                  <td
                    data-requirement-sticky-cell
                    className={cn(
                      "relative",
                      REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
                      REQUIREMENT_GRID_STICKY_BODY_CLASS
                    )}
                    style={{ width: titleColumnWidth, minWidth: titleColumnWidth, maxWidth: titleColumnWidth }}
                  >
                    <div
                      className={cn(
                        "flex h-full w-full min-w-0 items-center gap-1.5 px-page-x transition-colors duration-150 motion-reduce:transition-none",
                        isSelected
                          ? "bg-accent-primary/5 group-hover/requirement:bg-accent-primary/10"
                          : "group-hover/requirement:bg-layer-transparent-hover"
                      )}
                    >
                      {!readOnly && (
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
                  <td className={cn("truncate", REQUIREMENT_GRID_BODY_CELL_CLASS)}>
                    {requirement.display_id ? (
                      <RequirementIdentifier displayId={requirement.display_id} />
                    ) : (
                      <span className="text-placeholder">—</span>
                    )}
                  </td>
                  <td className={cn("truncate", REQUIREMENT_GRID_BODY_CELL_CLASS)}>
                    {requirement.source_display_id ? (
                      <RequirementIdentifier displayId={requirement.source_display_id} />
                    ) : (
                      <span className="text-placeholder">—</span>
                    )}
                  </td>
                  {/* 总览列一律单行截断：描述是富文本，长短不一会把行高拉得参差不齐 */}
                  {descriptionColumn && (
                    <td className={cn("truncate text-secondary", REQUIREMENT_GRID_BODY_CELL_CLASS)}>
                      <BuiltinCellValue
                        columnKey={descriptionColumn.key}
                        values={requirement}
                        resolveParentTitle={resolveParentTitle}
                      />
                    </td>
                  )}
                  <td className={REQUIREMENT_GRID_BODY_CELL_CLASS}>
                    <RequirementApprovalCell requirement={requirement} onOpenChangeRequest={onOpenChangeRequest} />
                  </td>
                  <td className={REQUIREMENT_GRID_BODY_CELL_CLASS}>
                    <RequirementProjectStageBadges
                      projectLinks={requirement.project_links}
                      resolveProjectName={resolveProjectName}
                    />
                  </td>
                  {remainingBuiltinColumns.map((column) => (
                    <td key={column.key} className={cn("truncate", REQUIREMENT_GRID_BODY_CELL_CLASS)}>
                      <BuiltinCellValue
                        columnKey={column.key}
                        values={requirement}
                        resolveParentTitle={resolveParentTitle}
                      />
                    </td>
                  ))}
                  <td className={REQUIREMENT_GRID_BODY_CELL_CLASS}>
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
                      <span className="truncate">{requirementTypeNames[requirement.requirement_type_id] ?? "—"}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!requirements.length && (
          <div className="grid place-items-center p-10 text-center">
            <p className="text-13 text-secondary">{t("workspace_products.requirements.data.views.empty")}</p>
          </div>
        )}
      </div>

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
};
