import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AlertCircle, ChevronLeft, ChevronRight, Library, Plus, Trash2 } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirementLibrary } from "@plane/types";
import { AlertModalCore, Breadcrumbs, Checkbox, Header, Loader } from "@plane/ui";
import { renderFormattedDateTime } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useRequirementLibrariesContext } from "./context";
import { getRequirementTypePath } from "../navigation";

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const SKELETON_COLUMNS = ["select", "name", "requirement_type", "description", "fields", "requirements", "updated", "actions"];
const SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"];
const GRID_TEMPLATE =
  "grid-cols-[44px_minmax(180px,1.3fr)_minmax(130px,0.9fr)_minmax(180px,1.3fr)_80px_96px_144px_56px]";

export const RequirementLibraryList = observer(function RequirementLibraryList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    workspaceSlug,
    libraries,
    isLoading,
    isMutating,
    error,
    fetchLibraries,
    deleteLibraries,
    setIsCreateModalOpen,
  } = useRequirementLibrariesContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [librariesToDelete, setLibrariesToDelete] = useState<TRequirementLibrary[]>([]);

  // ?requirement_type=<id>：从需求类型页「N 个标准库在用」跳进来时按类型收窄，可分享可移除
  const [searchParams, setSearchParams] = useSearchParams();
  const requirementTypeFilter = searchParams.get("requirement_type");

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredLibraries = useMemo(
    () =>
      libraries.filter((library) => {
        if (requirementTypeFilter && library.requirement_type_id !== requirementTypeFilter) return false;
        if (!normalizedSearch) return true;
        return [library.name, library.description, library.requirement_type_detail?.name ?? ""].some((value) =>
          value.toLocaleLowerCase().includes(normalizedSearch)
        );
      }),
    [libraries, normalizedSearch, requirementTypeFilter]
  );

  /** 被筛掉的类型名取自任一命中库的 requirement_type_detail，避免为了个名字再拉一次类型 */
  const filteredRequirementTypeName = useMemo(
    () =>
      requirementTypeFilter
        ? (libraries.find((library) => library.requirement_type_id === requirementTypeFilter)?.requirement_type_detail?.name ?? null)
        : null,
    [libraries, requirementTypeFilter]
  );

  const clearRequirementTypeFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("requirement_type");
    setSearchParams(next, { replace: true });
  };
  const totalPages = Math.max(1, Math.ceil(filteredLibraries.length / perPage));
  const paginatedLibraries = filteredLibraries.slice((page - 1) * perPage, page * perPage);
  // 非空标准库删不掉（后端会拒），所以也不允许勾选，否则批量删除必然失败
  const selectableLibraryIds = paginatedLibraries
    .filter((library) => library.item_count === 0)
    .map((library) => library.id);
  const selectedOnPageCount = selectableLibraryIds.filter((id) => selectedLibraryIds.includes(id)).length;
  const isPageSelected = selectableLibraryIds.length > 0 && selectedOnPageCount === selectableLibraryIds.length;
  const isPagePartiallySelected = selectedOnPageCount > 0 && !isPageSelected;

  useEffect(() => {
    setPage(1);
  }, [normalizedSearch, perPage, requirementTypeFilter]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    const availableIds = new Set(libraries.map((library) => library.id));
    setSelectedLibraryIds((current) => current.filter((id) => availableIds.has(id)));
  }, [libraries]);

  const clearSearch = () => {
    setSearchQuery("");
    setIsSearchOpen(false);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    if (searchQuery) {
      setSearchQuery("");
      return;
    }
    setIsSearchOpen(false);
    searchInputRef.current?.blur();
  };

  useOutsideClickDetector(searchInputRef, () => {
    if (isSearchOpen && searchQuery.trim() === "") setIsSearchOpen(false);
  });

  const resetView = () => {
    clearSearch();
    clearRequirementTypeFilter();
    setPage(1);
  };

  const togglePageSelection = () => {
    setSelectedLibraryIds((current) => {
      if (isPageSelected) return current.filter((id) => !selectableLibraryIds.includes(id));
      return Array.from(new Set([...current, ...selectableLibraryIds]));
    });
  };

  const handleDelete = async () => {
    if (librariesToDelete.length === 0) return;
    try {
      await deleteLibraries(librariesToDelete.map((library) => library.id));
      setSelectedLibraryIds((current) =>
        current.filter((id) => !librariesToDelete.some((library) => library.id === id))
      );
      setLibrariesToDelete([]);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message:
          librariesToDelete.length > 1
            ? t("requirement_libraries.list.delete_success", { count: librariesToDelete.length })
            : t("requirement_libraries.toast.deleted"),
      });
    } catch (requestError) {
      const payload = requestError as { error?: string; detail?: string };
      setLibrariesToDelete([]);
      void fetchLibraries().catch(() => undefined);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? payload?.detail ?? t("requirement_libraries.toast.failed"),
      });
    }
  };

  const renderEmptyState = () => {
    const hasFilters = Boolean(normalizedSearch || requirementTypeFilter);
    return (
      <div className="flex h-full min-h-80 items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
            <Library className="size-5" />
          </span>
          <h2 className="mt-3 text-14 font-medium text-primary">
            {t(hasFilters ? "requirement_libraries.list.empty_filtered_title" : "requirement_libraries.empty.title")}
          </h2>
          <p className="mt-1 text-12 leading-5 text-secondary">
            {t(
              hasFilters
                ? "requirement_libraries.list.empty_filtered_description"
                : "requirement_libraries.empty.description"
            )}
          </p>
          <Button
            className="mt-4"
            variant={hasFilters ? "secondary" : "primary"}
            onClick={hasFilters ? resetView : () => setIsCreateModalOpen(true)}
          >
            {t(hasFilters ? "requirement_libraries.list.reset_view" : "requirement_libraries.create")}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHead title={`${t("requirement_libraries.title")} - ${t("workspace_templates.title")}`} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={t("requirement_libraries.title")}
                      icon={<Library className="size-4 text-secondary" />}
                      isLast
                    />
                  }
                  isLast
                />
              </Breadcrumbs>
              {selectedLibraryIds.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setLibrariesToDelete(libraries.filter((library) => selectedLibraryIds.includes(library.id)))
                  }
                >
                  <Trash2 className="size-3.5 text-danger-primary" />
                  {t("requirement_libraries.list.delete_selected", { count: selectedLibraryIds.length })}
                </Button>
              )}
            </Header.LeftItem>
            <Header.RightItem className="gap-1.5">
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
                    aria-label={t("requirement_libraries.list.search_placeholder")}
                  />
                )}
                <div
                  className={`ml-auto box-border flex h-7 w-0 items-center justify-start gap-1 overflow-hidden rounded-md border border-transparent bg-surface-1 text-placeholder opacity-0 transition-[width] ease-linear ${
                    isSearchOpen ? "w-30 border-subtle px-2.5 opacity-100 md:w-64" : ""
                  }`}
                >
                  <SearchIcon className="h-3.5 w-3.5" />
                  <input
                    ref={searchInputRef}
                    className="w-full max-w-[234px] border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
                    placeholder={t("requirement_libraries.list.search_placeholder")}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                  />
                  {isSearchOpen && (
                    <button type="button" className="grid place-items-center" onClick={clearSearch}>
                      <CloseIcon className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="size-3.5" />
                {t("requirement_libraries.create")}
              </Button>
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        {requirementTypeFilter && (
          <div className="flex shrink-0 items-center gap-2 border-b border-subtle bg-layer-1 px-3 py-2">
            <span className="text-11 text-tertiary">{t("requirement_libraries.list.filtered_by")}</span>
            <span className="inline-flex items-center gap-1.5 rounded border border-accent-primary/25 bg-accent-primary/[0.06] px-2 py-0.5 text-11 text-accent-primary">
              {filteredRequirementTypeName ?? t("requirement_libraries.list.requirement_type_filter_fallback")}
              <button
                type="button"
                className="grid place-items-center hover:text-primary"
                onClick={clearRequirementTypeFilter}
                aria-label={t("requirement_libraries.list.clear_requirement_type_filter")}
              >
                <CloseIcon className="h-2.5 w-2.5" />
              </button>
            </span>
          </div>
        )}
        {isLoading ? (
          <div className="min-w-[1084px] flex-1 overflow-hidden">
            <div className={`grid ${GRID_TEMPLATE} items-center gap-3 border-b border-subtle bg-layer-1 px-3 py-2.5`}>
              {SKELETON_COLUMNS.map((column) => (
                <Loader.Item key={column} height="14px" />
              ))}
            </div>
            {SKELETON_ROWS.map((row) => (
              <div key={row} className={`grid ${GRID_TEMPLATE} items-center gap-3 border-b border-subtle px-3 py-3`}>
                {SKELETON_COLUMNS.map((column) => (
                  <Loader.Item key={column} height="20px" />
                ))}
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex h-full min-h-80 items-center justify-center p-6 text-center">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-full bg-danger-subtle text-danger-primary">
                <AlertCircle className="size-5" />
              </span>
              <h2 className="mt-3 text-14 font-medium text-primary">{t("requirement_libraries.list.error_title")}</h2>
              <p className="mt-1 max-w-sm text-12 text-secondary">{error}</p>
              <Button className="mt-4" variant="secondary" onClick={() => void fetchLibraries().catch(() => undefined)}>
                {t("retry")}
              </Button>
            </div>
          </div>
        ) : filteredLibraries.length === 0 ? (
          renderEmptyState()
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1084px] table-fixed border-collapse text-left">
                <thead className="sticky top-0 z-[1] bg-layer-1">
                  <tr className="border-b border-subtle text-11 font-medium text-secondary">
                    <th className="w-11 px-3 py-2.5">
                      <Checkbox
                        checked={isPageSelected}
                        indeterminate={isPagePartiallySelected}
                        onChange={togglePageSelection}
                        aria-label={t("requirement_libraries.list.select_page")}
                      />
                    </th>
                    {/* 描述原来没设宽度，table-fixed 下会吃掉全部余量；改成和名称等宽 */}
                    <th className="w-[22%] px-3 py-2.5">{t("requirement_libraries.fields.name")}</th>
                    <th className="w-[15%] px-3 py-2.5">{t("requirement_libraries.fields.requirement_type")}</th>
                    <th className="w-[22%] px-3 py-2.5">{t("requirement_libraries.fields.description")}</th>
                    <th className="w-20 px-3 py-2.5">{t("requirement_libraries.fields.field_count")}</th>
                    <th className="w-24 px-3 py-2.5">{t("requirement_libraries.fields.item_count")}</th>
                    <th className="w-36 px-3 py-2.5">{t("requirement_libraries.list.updated_at")}</th>
                    <th className="w-14 px-3 py-2.5">{t("requirement_libraries.fields.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLibraries.map((library) => {
                    const isEmptyLibrary = library.item_count === 0;
                    const isSelected = selectedLibraryIds.includes(library.id);
                    return (
                      <tr
                        key={library.id}
                        onClick={() => navigate(`/${workspaceSlug}/templates/libraries/${library.id}`)}
                        className={`group cursor-pointer border-b border-subtle transition-colors hover:bg-layer-transparent-hover ${
                          isSelected ? "bg-accent-primary/[0.05]" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            disabled={!isEmptyLibrary}
                            onChange={() =>
                              setSelectedLibraryIds((current) =>
                                isSelected ? current.filter((id) => id !== library.id) : [...current, library.id]
                              )
                            }
                            aria-label={t("requirement_libraries.list.select_library", { name: library.name })}
                          />
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <Link
                            to={`/${workspaceSlug}/templates/libraries/${library.id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="block truncate text-13 font-medium text-primary group-hover:text-accent-primary"
                          >
                            {library.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 align-middle" onClick={(event) => event.stopPropagation()}>
                          <Link
                            to={getRequirementTypePath(workspaceSlug, library.requirement_type_id)}
                            className="inline-block max-w-full truncate rounded-full bg-accent-primary/[0.08] px-2 py-0.5 text-11 text-accent-primary hover:bg-accent-primary/[0.14]"
                          >
                            {library.requirement_type_detail?.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <span className="block truncate text-12 text-secondary">
                            {library.description || t("requirement_libraries.list.no_description")}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-12 tabular-nums text-secondary">{library.field_count}</td>
                        <td className="px-3 py-2.5 text-12 tabular-nums text-secondary">{library.item_count}</td>
                        <td className="px-3 py-2.5 text-11 whitespace-nowrap text-secondary">
                          {renderFormattedDateTime(library.updated_at)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-center align-middle"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Tooltip
                            tooltipContent={
                              isEmptyLibrary
                                ? t("delete")
                                : t("requirement_libraries.list.delete_blocked", {
                                    count: library.item_count,
                                  })
                            }
                          >
                            <button
                              type="button"
                              disabled={!isEmptyLibrary}
                              onClick={() => setLibrariesToDelete([library])}
                              className="grid size-7 place-items-center rounded-md text-tertiary transition-colors hover:bg-danger-subtle hover:text-danger-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-tertiary"
                              aria-label={t("requirement_libraries.list.delete_library", { name: library.name })}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex h-11 shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 text-11 text-secondary">
              <div className="flex items-center gap-2">
                <span>{t("requirement_libraries.list.total", { count: filteredLibraries.length })}</span>
                <select
                  value={perPage}
                  onChange={(event) => setPerPage(Number(event.target.value))}
                  className="h-7 rounded-md border border-subtle bg-surface-1 px-2 text-11 text-secondary outline-none hover:bg-layer-transparent-hover"
                  aria-label={t("requirement_libraries.list.per_page")}
                >
                  {PAGE_SIZE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {t("requirement_libraries.list.per_page_value", { count: value })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="grid size-7 place-items-center rounded-md border border-subtle text-secondary hover:bg-layer-transparent-hover disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t("requirement_libraries.list.previous_page")}
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <span className="min-w-16 text-center tabular-nums">
                  {t("requirement_libraries.list.page", { page, total: totalPages })}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="grid size-7 place-items-center rounded-md border border-subtle text-secondary hover:bg-layer-transparent-hover disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t("requirement_libraries.list.next_page")}
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </ContentWrapper>
      <AlertModalCore
        handleClose={() => setLibrariesToDelete([])}
        handleSubmit={handleDelete}
        isSubmitDisabled={librariesToDelete.length === 0}
        isSubmitting={isMutating}
        isOpen={librariesToDelete.length > 0}
        title={t(
          librariesToDelete.length > 1
            ? "requirement_libraries.list.delete_many_title"
            : "requirement_libraries.list.delete_title"
        )}
        content={
          librariesToDelete.length > 1 ? (
            t("requirement_libraries.list.delete_many_description", { count: librariesToDelete.length })
          ) : (
            <>
              {t("requirement_libraries.list.delete_description_prefix")}
              <span className="font-medium text-primary">{librariesToDelete[0]?.name}</span>
              {t("requirement_libraries.list.delete_description_suffix")}
            </>
          )
        }
      />
    </>
  );
});
