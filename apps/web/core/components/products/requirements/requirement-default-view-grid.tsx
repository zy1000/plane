"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pagination } from "antd";
import { Copy, Loader as LoaderIcon, Trash2 } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import type {
  TRequirementDetail,
  TRequirementDetailData,
  TRequirementField,
  TRequirementTemplateSchema,
} from "@plane/types";
import { AlertModalCore, CustomMenu, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  getCurrentPageOffset,
  LeafValue,
  MenuRowLabel,
} from "@/components/template-management/requirements/requirement-grid-shared";
import { copyRequirementDetailData } from "@/components/template-management/requirements/use-requirement-detail-grid-editor";
import { getBuiltinValue } from "./requirement-data-views";

/**
 * 多模板时的默认视图：跨全部模板的总览。
 *
 * 只展示每个模板都必有的标题与描述，外加一列「所属模板」。刻意做成只读 —— 在只有
 * 两列的视图里新增一行，其余必填字段无处可填；要录入就点进对应的模板视图。
 */
type TProps = {
  workspaceSlug: string;
  templates: TRequirementTemplateSchema[];
  details: TRequirementDetail[];
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
  /** 复制一行：新行绑定同一个模板，插在原行后面 */
  onDuplicate: (payload: { templateId: string; data: TRequirementDetailData; afterId: string }) => Promise<unknown>;
  onOpenTemplateView: (templateId: string) => void;
  /** 与模板视图共用顶部工具栏容器：切视图时右上角不该整排控件消失 */
  toolbarPortalEl?: HTMLElement | null;
};

/** 借标题/描述字段的定义来渲染值，这样富文本、附件等类型的呈现与模板视图完全一致。 */
const findBuiltinField = (
  templates: TRequirementTemplateSchema[],
  detail: TRequirementDetail,
  key: "title" | "description"
): TRequirementField | undefined => {
  const template = templates.find((item) => item.id === detail.template_id);
  const fieldId = template?.builtin_field_ids?.[key];
  return template?.fields.find((field) => field.id === fieldId);
};

export const RequirementDefaultViewGrid = (props: TProps) => {
  const {
    workspaceSlug,
    templates,
    details,
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
    onOpenTemplateView,
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

  const templateTitles = useMemo(
    () => Object.fromEntries(templates.map((template) => [template.id, template.title])),
    [templates]
  );
  const currentPageOffset = getCurrentPageOffset(prevCursor, nextCursor, prevPageResults, nextPageResults);
  const visibleIds = details.map((detail) => detail.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const toggleAll = () => setSelectedIds(allSelected ? [] : visibleIds);
  const toggleOne = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  /**
   * 删除一律走二次确认。
   *
   * 主网格的删除是「暂存 + 保存更改」的两步，本身就有反悔余地；这里是点一下就直接
   * 打接口，没有撤销，所以必须挡一道 —— 与模板列表等其他删除入口的 AlertModalCore
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
  const handleDuplicate = (detail: TRequirementDetail) => {
    const fields = templates.find((template) => template.id === detail.template_id)?.fields ?? [];
    return onDuplicate({
      templateId: detail.template_id,
      data: copyRequirementDetailData(detail.data, fields),
      afterId: detail.id,
    });
  };

  if (isLoading && !details.length) {
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
          table-fixed + colgroup 定列宽：只有三列时如果任由浏览器分配，标题列会被撑到
          几百像素而内容只有几个字，「所属模板」被甩到最右，中间一大片空白。
          表头/竖线/字号/行高一律对齐 RequirementGridHeader，切换视图时不该换一副样子。
        */}
        <table className="w-full table-fixed border-collapse text-left text-13">
          <colgroup>
            <col className="w-10" />
            <col className="w-[28%]" />
            <col />
            <col className="w-[18%]" />
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
              <th className="border-r border-subtle px-3 py-2.5 align-middle text-primary">
                {t("workspace_products.requirements.data.views.title_column")}
              </th>
              <th className="border-r border-subtle px-3 py-2.5 align-middle text-primary">
                {t("workspace_products.requirements.data.views.description_column")}
              </th>
              <th
                className={cn(
                  "px-3 py-2.5 align-middle text-primary",
                  !readOnly && "border-r border-subtle"
                )}
              >
                {t("workspace_products.requirements.data.views.template_column")}
              </th>
              {!readOnly && (
                <th className="px-2 py-2.5 text-center align-middle text-primary">
                  {t("workspace_templates.requirements.fields.actions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {details.map((detail) => {
              const titleField = findBuiltinField(templates, detail, "title");
              const descriptionField = findBuiltinField(templates, detail, "description");
              return (
                <tr key={detail.id} className="group/detail border-b border-subtle hover:bg-layer-1">
                  <td className="border-r border-subtle px-3 py-2 align-middle">
                    {!readOnly && (
                      <input
                        type="checkbox"
                        className="size-3.5 cursor-pointer"
                        checked={selectedIds.includes(detail.id)}
                        onChange={() => toggleOne(detail.id)}
                      />
                    )}
                  </td>
                  {/* 总览列一律单行截断：描述是富文本，长短不一会把行高拉得参差不齐 */}
                  <td className="truncate border-r border-subtle px-3 py-2 align-middle">
                    {titleField ? (
                      <LeafValue
                        field={titleField}
                        value={getBuiltinValue(detail, templates, "title") ?? undefined}
                        workspaceSlug={workspaceSlug}
                      />
                    ) : null}
                  </td>
                  <td className="truncate border-r border-subtle px-3 py-2 align-middle text-secondary">
                    {descriptionField ? (
                      <LeafValue
                        field={descriptionField}
                        value={getBuiltinValue(detail, templates, "description") ?? undefined}
                        workspaceSlug={workspaceSlug}
                      />
                    ) : null}
                  </td>
                  <td className={cn("px-3 py-2 align-middle", !readOnly && "border-r border-subtle")}>
                    <button
                      type="button"
                      onClick={() => onOpenTemplateView(detail.template_id)}
                      title={t("workspace_products.requirements.data.views.open_template_view", {
                        name: templateTitles[detail.template_id] ?? "",
                      })}
                      className={cn(
                        "inline-flex max-w-full items-center rounded-md bg-layer-2 px-2 py-0.5 text-12",
                        "text-secondary transition-colors hover:bg-layer-3 hover:text-primary"
                      )}
                    >
                      <span className="truncate">{templateTitles[detail.template_id] ?? "—"}</span>
                    </button>
                  </td>
                  {!readOnly && (
                    <td className="px-2 py-2 text-center align-middle">
                      {/* 总览视图只给复制与删除：改字段值要回到对应的模板视图 */}
                      <div className="flex justify-center">
                        <CustomMenu
                          ellipsis
                          placement="bottom-end"
                          buttonClassName="text-tertiary hover:text-primary"
                        >
                          <CustomMenu.MenuItem
                            onClick={() => void handleDuplicate(detail)}
                            disabled={isMutating}
                          >
                            <MenuRowLabel icon={Copy} label={t("workspace_templates.requirements.data.copy")} />
                          </CustomMenu.MenuItem>
                          <CustomMenu.MenuItem
                            onClick={() => setIdsToDelete([detail.id])}
                            disabled={isMutating}
                          >
                            <MenuRowLabel icon={Trash2} label={t("delete")} tone="danger" />
                          </CustomMenu.MenuItem>
                        </CustomMenu>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!details.length && (
          <div className="grid place-items-center p-10 text-center">
            <p className="text-13 text-secondary">{t("workspace_products.requirements.data.views.empty")}</p>
          </div>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
        <span className="text-sm text-secondary">
          {isLoading && <LoaderIcon className="mr-1 inline size-3.5 animate-spin" />}
          {totalCount > 0
            ? t("workspace_templates.requirements.data.range", {
                start: currentPageOffset * perPage + 1,
                end: Math.min(currentPageOffset * perPage + details.length, totalCount),
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
