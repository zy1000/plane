import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Link, useNavigate } from "react-router";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileText,
  Plus,
  Trash2,
} from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirement } from "@plane/types";
import { AlertModalCore, Breadcrumbs, Checkbox, Header, Loader } from "@plane/ui";
import { cn, renderFormattedDateTime, stripAndTruncateHTML } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useRequirementLibraries } from "@/hooks/store/use-requirement-libraries";
import { useRequirementTemplatesContext } from "./context";

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const SKELETON_COLUMNS = ["select", "name", "description", "fields", "usage", "updated", "actions"];
const SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6", "row-7", "row-8"];
const SKELETON_GRID =
  "grid-cols-[44px_minmax(180px,1.2fr)_minmax(200px,1.2fr)_80px_128px_144px_56px]";

export const RequirementTemplateList = observer(function RequirementTemplateList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    workspaceSlug,
    templates,
    isLoading,
    isMutating,
    error,
    fetchTemplates,
    deleteTemplates,
    setIsCreateModalOpen,
  } = useRequirementTemplatesContext();
  const { libraries } = useRequirementLibraries(workspaceSlug);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [templatesToDelete, setTemplatesToDelete] = useState<TRequirement[]>([]);

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) => {
        if (!normalizedSearch) return true;
        const description = template.description_html
          ? stripAndTruncateHTML(template.description_html, 1000).toLocaleLowerCase()
          : "";
        return [template.title, description].some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
      }),
    [normalizedSearch, templates]
  );
  // 被标准库引用的模板不能删——库内标准需求靠它解析字段
  const libraryCountByTemplate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const library of libraries) {
      counts.set(library.template_id, (counts.get(library.template_id) ?? 0) + 1);
    }
    return counts;
  }, [libraries]);

  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / perPage));
  const paginatedTemplates = filteredTemplates.slice((page - 1) * perPage, page * perPage);
  // 被引用的模板不可删，也就不该被勾选——否则批量删除必然 409
  const paginatedTemplateIds = paginatedTemplates
    .filter((template) => !libraryCountByTemplate.has(template.id))
    .map((template) => template.id);
  const selectedOnPageCount = paginatedTemplateIds.filter((id) => selectedTemplateIds.includes(id)).length;
  const isPageSelected = paginatedTemplateIds.length > 0 && selectedOnPageCount === paginatedTemplateIds.length;
  const isPagePartiallySelected = selectedOnPageCount > 0 && !isPageSelected;

  useEffect(() => {
    setPage(1);
  }, [normalizedSearch, perPage]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    const availableIds = new Set(templates.map((template) => template.id));
    setSelectedTemplateIds((current) => current.filter((id) => availableIds.has(id)));
  }, [templates]);

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
    setPage(1);
  };

  const togglePageSelection = () => {
    setSelectedTemplateIds((current) => {
      if (isPageSelected) return current.filter((id) => !paginatedTemplateIds.includes(id));
      return Array.from(new Set([...current, ...paginatedTemplateIds]));
    });
  };

  const handleDelete = async () => {
    if (templatesToDelete.length === 0) return;
    try {
      await deleteTemplates(templatesToDelete.map((template) => template.id));
      setSelectedTemplateIds((current) =>
        current.filter((id) => !templatesToDelete.some((template) => template.id === id))
      );
      setTemplatesToDelete([]);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message:
          templatesToDelete.length > 1
            ? t("workspace_templates.requirements.list.delete_success", { count: templatesToDelete.length })
            : t("workspace_templates.requirements.toast.deleted"),
      });
    } catch (requestError) {
      const payload = requestError as { error?: string; detail?: string };
      setTemplatesToDelete([]);
      void fetchTemplates().catch(() => undefined);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? payload?.detail ?? t("workspace_templates.requirements.toast.failed"),
      });
    }
  };

  const renderEmptyState = () => {
    const hasFilters = Boolean(normalizedSearch);
    return (
      <div className="flex h-full min-h-80 items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
            <FilePlus2 className="size-5" />
          </span>
          <h2 className="mt-3 text-14 font-medium text-primary">
            {t(
              hasFilters
                ? "workspace_templates.requirements.list.empty_filtered_title"
                : "workspace_templates.requirements.empty.title"
            )}
          </h2>
          <p className="mt-1 text-12 leading-5 text-secondary">
            {t(
              hasFilters
                ? "workspace_templates.requirements.list.empty_filtered_description"
                : "workspace_templates.requirements.empty.description"
            )}
          </p>
          <Button
            className="mt-4"
            variant={hasFilters ? "secondary" : "primary"}
            onClick={hasFilters ? resetView : () => setIsCreateModalOpen(true)}
          >
            {t(
              hasFilters
                ? "workspace_templates.requirements.list.reset_view"
                : "workspace_templates.requirements.create"
            )}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHead title={`${t("workspace_templates.requirements.title")} - ${t("workspace_templates.title")}`} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={t("workspace_templates.requirements.title")}
                      icon={<FileText className="size-4 text-secondary" />}
                      isLast
                    />
                  }
                  isLast
                />
              </Breadcrumbs>
              {selectedTemplateIds.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setTemplatesToDelete(templates.filter((template) => selectedTemplateIds.includes(template.id)))
                  }
                >
                  <Trash2 className="size-3.5 text-danger-primary" />
                  {t("workspace_templates.requirements.list.delete_selected", {
                    count: selectedTemplateIds.length,
                  })}
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
                    aria-label={t("workspace_templates.requirements.list.search_placeholder")}
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
                    placeholder={t("workspace_templates.requirements.list.search_placeholder")}
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
                {t("workspace_templates.requirements.create")}
              </Button>
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        {isLoading ? (
          <div className="min-w-[720px] flex-1 overflow-hidden">
            <div className={`grid ${SKELETON_GRID} items-center gap-3 border-b border-subtle bg-layer-1 px-3 py-2.5`}>
              {SKELETON_COLUMNS.map((column) => (
                <Loader.Item key={column} height="14px" />
              ))}
            </div>
            {SKELETON_ROWS.map((row) => (
              <div
                key={row}
                className={`grid ${SKELETON_GRID} items-center gap-3 border-b border-subtle px-3 py-3`}
              >
                {SKELETON_COLUMNS.map((column, index) => (
                  <Loader.Item
                    key={column}
                    height={index === 0 || index === SKELETON_COLUMNS.length - 1 ? "16px" : "20px"}
                  />
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
              <h2 className="mt-3 text-14 font-medium text-primary">
                {t("workspace_templates.requirements.list.error_title")}
              </h2>
              <p className="mt-1 max-w-sm text-12 text-secondary">{error}</p>
              <Button className="mt-4" variant="secondary" onClick={() => void fetchTemplates().catch(() => undefined)}>
                {t("retry")}
              </Button>
            </div>
          </div>
        ) : filteredTemplates.length === 0 ? (
          renderEmptyState()
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[940px] table-fixed border-collapse text-left">
                <thead className="sticky top-0 z-[1] bg-layer-1">
                  <tr className="border-b border-subtle text-11 font-medium text-secondary">
                    <th className="w-11 px-3 py-2.5">
                      <Checkbox
                        checked={isPageSelected}
                        indeterminate={isPagePartiallySelected}
                        onChange={togglePageSelection}
                        aria-label={t("workspace_templates.requirements.list.select_page")}
                      />
                    </th>
                    {/* 名称与说明各占 28%：说明原来没设宽度，table-fixed 下会吃掉全部余量（1920 时占 53%） */}
                    <th className="w-[28%] px-3 py-2.5">{t("workspace_templates.requirements.fields.name")}</th>
                    <th className="w-[28%] px-3 py-2.5">{t("workspace_templates.requirements.fields.description")}</th>
                    <th className="w-20 px-3 py-2.5">{t("workspace_templates.requirements.list.field_count")}</th>
                    <th className="w-32 px-3 py-2.5">{t("workspace_templates.requirements.list.used_by")}</th>
                    <th className="w-36 px-3 py-2.5">{t("workspace_templates.requirements.list.updated_at")}</th>
                    <th className="w-14 px-3 py-2.5">{t("workspace_templates.requirements.fields.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTemplates.map((template) => {
                    const isSelected = selectedTemplateIds.includes(template.id);
                    const description = template.description_html
                      ? stripAndTruncateHTML(template.description_html, 180)
                      : t("workspace_templates.requirements.list.no_description");
                    const usedByCount = libraryCountByTemplate.get(template.id) ?? 0;
                    return (
                      <tr
                        key={template.id}
                        onClick={() => navigate(`/${workspaceSlug}/templates/requirements/${template.id}`)}
                        className={`group cursor-pointer border-b border-subtle transition-colors hover:bg-layer-transparent-hover ${
                          isSelected ? "bg-accent-primary/[0.05]" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            disabled={usedByCount > 0}
                            onChange={() =>
                              setSelectedTemplateIds((current) =>
                                isSelected ? current.filter((id) => id !== template.id) : [...current, template.id]
                              )
                            }
                            aria-label={t("workspace_templates.requirements.list.select_template", {
                              name: template.title,
                            })}
                          />
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <Link
                            to={`/${workspaceSlug}/templates/requirements/${template.id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="block truncate text-13 font-medium text-primary group-hover:text-accent-primary"
                          >
                            {template.title}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <span className="block truncate text-12 text-secondary">{description}</span>
                        </td>
                        <td className="px-3 py-2.5 text-12 tabular-nums text-secondary">{template.field_count}</td>
                        <td className="px-3 py-2.5 align-middle" onClick={(event) => event.stopPropagation()}>
                          {usedByCount > 0 ? (
                            <Link
                              to={`/${workspaceSlug}/templates/libraries`}
                              className="inline-block rounded-full bg-accent-primary/[0.08] px-2 py-0.5 text-11 text-accent-primary hover:bg-accent-primary/[0.14]"
                            >
                              {t("workspace_templates.requirements.list.used_by_count", { count: usedByCount })}
                            </Link>
                          ) : (
                            <span className="text-11 text-tertiary">
                              {t("workspace_templates.requirements.list.not_used")}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-11 whitespace-nowrap text-secondary">
                          {renderFormattedDateTime(template.updated_at)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-center align-middle"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Tooltip
                            tooltipContent={
                              usedByCount > 0
                                ? t("workspace_templates.requirements.list.delete_blocked", { count: usedByCount })
                                : t("delete")
                            }
                          >
                            <button
                              type="button"
                              disabled={usedByCount > 0}
                              onClick={() => setTemplatesToDelete([template])}
                              className="grid size-7 place-items-center rounded-md text-tertiary transition-colors hover:bg-danger-subtle hover:text-danger-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-tertiary"
                              aria-label={t("workspace_templates.requirements.list.delete_template", {
                                name: template.title,
                              })}
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
                <span>
                  {t("workspace_templates.requirements.list.total", {
                    count: filteredTemplates.length,
                  })}
                </span>
                <select
                  value={perPage}
                  onChange={(event) => setPerPage(Number(event.target.value))}
                  className="h-7 rounded-md border border-subtle bg-surface-1 px-2 text-11 text-secondary outline-none hover:bg-layer-transparent-hover"
                  aria-label={t("workspace_templates.requirements.list.per_page")}
                >
                  {PAGE_SIZE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {t("workspace_templates.requirements.list.per_page_value", { count: value })}
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
                  aria-label={t("workspace_templates.requirements.list.previous_page")}
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <span className="min-w-16 text-center tabular-nums">
                  {t("workspace_templates.requirements.list.page", { page, total: totalPages })}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="grid size-7 place-items-center rounded-md border border-subtle text-secondary hover:bg-layer-transparent-hover disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t("workspace_templates.requirements.list.next_page")}
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </ContentWrapper>
      <AlertModalCore
        handleClose={() => setTemplatesToDelete([])}
        handleSubmit={handleDelete}
        isSubmitDisabled={templatesToDelete.length === 0}
        isSubmitting={isMutating}
        isOpen={templatesToDelete.length > 0}
        title={t(
          templatesToDelete.length > 1
            ? "workspace_templates.requirements.list.delete_many_title"
            : "workspace_templates.requirements.list.delete_one_title"
        )}
        content={
          templatesToDelete.length > 1 ? (
            t("workspace_templates.requirements.list.delete_many_description", {
              count: templatesToDelete.length,
            })
          ) : (
            <>
              {t("workspace_templates.requirements.list.delete_one_description_prefix")}
              <span className="font-medium text-primary">{templatesToDelete[0]?.title}</span>
              {t("workspace_templates.requirements.list.delete_one_description_suffix")}
            </>
          )
        }
      />
    </>
  );
});
