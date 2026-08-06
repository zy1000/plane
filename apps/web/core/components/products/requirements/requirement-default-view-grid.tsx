"use client";

import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pagination } from "antd";
import { Copy, History, Loader as LoaderIcon, Maximize2, Send, Trash2, Undo2 } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import type { TRequirement, TRequirementData, TRequirementTypeSchema } from "@plane/types";
import { AlertModalCore, CustomMenu, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { BuiltinCellValue, getBuiltinColumnsFor } from "@/components/requirements/requirement-builtin-fields";
import { RequirementApprovalCell } from "./approval/requirement-approval-cell";
import { getCurrentPageOffset, MenuRowLabel } from "@/components/requirements/requirement-grid-shared";
import { copyRequirementData } from "@/components/requirements/use-requirement-grid-editor";
import { useRequirementTitles } from "@/components/requirements/use-requirement-titles";

/**
 * 多类型时的默认视图：跨全部需求类型的总览。
 *
 * 只展示每行都有的八个内置字段，外加一列「所属类型」—— 自定义字段随类型而异，跨类型
 * 摆在一张表里对不上列。刻意做成只读：总览里新增一行，对应类型的必填字段无处可填；
 * 要录入或改值就点进对应的类型视图。
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
    <div className="flex flex-1 flex-col overflow-hidden">
      {toolbarPortalEl ? createPortal(toolbar, toolbarPortalEl) : <div className="px-4 py-2">{toolbar}</div>}

      <div className="flex-1 overflow-auto">
        {/*
          table-fixed + colgroup 定列宽：任由浏览器按内容分配，标题会被撑到几百像素而
          状态、优先级这些短列挤成一团。列宽直接取内置列定义里的那份，与类型视图对齐；
          加起来放不下时整表横向滚动，而不是把每列压扁。
          表头/竖线/字号/行高一律对齐 RequirementGridHeader，切换视图时不该换一副样子。
        */}
        <table className="w-full table-fixed border-collapse text-left text-13">
          <colgroup>
            <col className="w-10" />
            <col className="w-24" />
            {builtinColumns.map((column) => (
              <col key={column.key} className={column.width} />
            ))}
            <col className="w-40" />
            {!readOnly && <col className="w-16" />}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-layer-1 text-13 font-medium text-secondary">
            <tr className="border-b border-subtle">
              <th className="border-r border-subtle px-3 py-2.5 align-middle">
                {!readOnly && (
                  <input
                    type="checkbox"
                    className="size-3.5 cursor-pointer"
                    checked={allSelected}
                    disabled={!visibleIds.length}
                    onChange={toggleAll}
                  />
                )}
              </th>
              {/* 审批态紧跟勾选框：这是每行都要扫一眼的信息，放到最后要横滚才看得见 */}
              <th className="border-r border-subtle px-3 py-2.5 text-center align-middle text-primary">
                {t("requirement_approval.column")}
              </th>
              {builtinColumns.map((column) => (
                <th key={column.key} className="border-r border-subtle px-3 py-2.5 align-middle text-primary">
                  {t(column.labelKey)}
                </th>
              ))}
              <th
                className={cn(
                  "px-3 py-2.5 align-middle text-primary",
                  !readOnly && "border-r border-subtle"
                )}
              >
                {t("workspace_products.requirements.data.views.requirement_type_column")}
              </th>
              {!readOnly && (
                <th className="px-2 py-2.5 text-center align-middle text-primary">
                  {t("requirement_fields.fields.actions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {requirements.map((requirement) => {
              return (
                <tr key={requirement.id} className="group/requirement border-b border-subtle hover:bg-layer-1">
                  <td className="border-r border-subtle px-3 py-2 align-middle">
                    {!readOnly && (
                      <input
                        type="checkbox"
                        className="size-3.5 cursor-pointer"
                        checked={selectedIds.includes(requirement.id)}
                        onChange={() => toggleOne(requirement.id)}
                      />
                    )}
                  </td>
                  <td className="border-r border-subtle px-2 py-2 align-middle">
                    <RequirementApprovalCell requirement={requirement} onOpenChangeRequest={onOpenChangeRequest} />
                  </td>
                  {/* 总览列一律单行截断：描述是富文本，长短不一会把行高拉得参差不齐 */}
                  {builtinColumns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "truncate border-r border-subtle px-3 py-2 align-middle",
                        column.key === "description_html" && "text-secondary"
                      )}
                    >
                      {column.key === "title" ? (
                        // 详情入口只挂在标题格上：这张表整行没有点击语义，加在这里最不打架
                        <span className="flex min-w-0 items-center gap-1">
                          <span className="min-w-0 flex-1 truncate">
                            <BuiltinCellValue columnKey={column.key} values={requirement} />
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenDetail(requirement.id)}
                            title={t("requirement_detail.open")}
                            className="grid size-6 shrink-0 place-items-center rounded text-tertiary opacity-0 transition-opacity group-hover/requirement:opacity-100 focus-visible:opacity-100 hover:bg-layer-transparent-hover hover:text-primary"
                          >
                            <Maximize2 className="size-3.5" />
                          </button>
                        </span>
                      ) : (
                        <BuiltinCellValue
                          columnKey={column.key}
                          values={requirement}
                          resolveParentTitle={resolveParentTitle}
                        />
                      )}
                    </td>
                  ))}
                  <td className={cn("px-3 py-2 align-middle", !readOnly && "border-r border-subtle")}>
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
                  {!readOnly && (
                    <td className="px-2 py-2 text-center align-middle">
                      {/* 总览视图只给复制与删除：改字段值要回到对应的类型视图 */}
                      <div className="flex justify-center">
                        <CustomMenu
                          ellipsis
                          placement="bottom-end"
                          buttonClassName="text-tertiary hover:text-primary"
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
                      </div>
                    </td>
                  )}
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
