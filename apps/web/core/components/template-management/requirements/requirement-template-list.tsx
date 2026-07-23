import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link, useNavigate } from "react-router";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileText,
  Filter,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirement, TRequirementStatus } from "@plane/types";
import { AlertModalCore, Avatar, Breadcrumbs, Checkbox, CustomMenu, Header, Loader } from "@plane/ui";
import { calculateTimeAgo, getFileURL, stripAndTruncateHTML } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useRequirementTemplatesContext } from "./context";

type TTemplateFilter = "all" | TRequirementStatus | "active" | "inactive";

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const SKELETON_COLUMNS = ["select", "name", "description", "owner", "status", "approval", "updated", "actions"];
const SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6", "row-7", "row-8"];

const STATUS_DOT_CLASS: Record<TRequirementStatus, string> = {
  draft: "bg-layer-3",
  in_review: "bg-warning-primary",
  published: "bg-success-primary",
  changing: "bg-accent-primary",
};

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
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<TTemplateFilter>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [templatesToDelete, setTemplatesToDelete] = useState<TRequirement[]>([]);

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) => {
        const matchesFilter =
          filter === "all" ||
          (filter === "active" && template.is_active) ||
          (filter === "inactive" && !template.is_active) ||
          template.status === filter;
        if (!matchesFilter) return false;
        if (!normalizedSearch) return true;
        const description = template.description_html
          ? stripAndTruncateHTML(template.description_html, 1000).toLocaleLowerCase()
          : "";
        return [template.title, description, template.owner_detail?.display_name ?? ""].some((value) =>
          value.toLocaleLowerCase().includes(normalizedSearch)
        );
      }),
    [filter, normalizedSearch, templates]
  );
  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / perPage));
  const paginatedTemplates = filteredTemplates.slice((page - 1) * perPage, page * perPage);
  const paginatedTemplateIds = paginatedTemplates.map((template) => template.id);
  const selectedOnPageCount = paginatedTemplateIds.filter((id) => selectedTemplateIds.includes(id)).length;
  const isPageSelected = paginatedTemplateIds.length > 0 && selectedOnPageCount === paginatedTemplateIds.length;
  const isPagePartiallySelected = selectedOnPageCount > 0 && !isPageSelected;

  useEffect(() => {
    setPage(1);
  }, [filter, normalizedSearch, perPage]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    const availableIds = new Set(templates.map((template) => template.id));
    setSelectedTemplateIds((current) => current.filter((id) => availableIds.has(id)));
  }, [templates]);

  const resetView = () => {
    setSearchQuery("");
    setFilter("all");
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

  const filterOptions: { value: TTemplateFilter; label: string }[] = [
    { value: "all", label: t("workspace_templates.requirements.list.filters.all") },
    { value: "draft", label: t("workspace_templates.requirements.statuses.draft") },
    { value: "in_review", label: t("workspace_templates.requirements.statuses.in_review") },
    { value: "published", label: t("workspace_templates.requirements.statuses.published") },
    { value: "changing", label: t("workspace_templates.requirements.statuses.changing") },
    { value: "active", label: t("workspace_templates.requirements.active") },
    { value: "inactive", label: t("workspace_templates.requirements.inactive") },
  ];

  const renderEmptyState = () => {
    const hasFilters = Boolean(normalizedSearch || filter !== "all");
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
              <label className="relative block w-40 lg:w-56">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-placeholder" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("workspace_templates.requirements.list.search_placeholder")}
                  className="focus:border-accent-primary h-8 w-full rounded-md border border-subtle bg-surface-1 pr-2 pl-8 text-12 text-primary outline-none placeholder:text-placeholder"
                />
              </label>
              <CustomMenu
                placement="bottom-end"
                optionsClassName="w-48 p-1.5"
                customButton={
                  <Tooltip tooltipContent={t("workspace_templates.requirements.list.filter")}>
                    <button
                      type="button"
                      className={`grid size-8 place-items-center rounded-md border text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary ${
                        filter === "all"
                          ? "border-subtle bg-surface-1"
                          : "border-accent-subtle bg-accent-primary/10 text-accent-primary"
                      }`}
                      aria-label={t("workspace_templates.requirements.list.filter")}
                    >
                      <Filter className="size-3.5" />
                    </button>
                  </Tooltip>
                }
              >
                {filterOptions.map((option) => (
                  <CustomMenu.MenuItem key={option.value} onClick={() => setFilter(option.value)}>
                    <div className="flex w-full items-center justify-between gap-3 px-1 py-0.5">
                      <span className="truncate text-12 text-secondary">{option.label}</span>
                      <span className="grid size-4 shrink-0 place-items-center">
                        {filter === option.value && <Check className="size-3.5 text-accent-primary" />}
                      </span>
                    </div>
                  </CustomMenu.MenuItem>
                ))}
              </CustomMenu>
              <Tooltip tooltipContent={t("workspace_templates.requirements.list.refresh")}>
                <button
                  type="button"
                  onClick={() => void fetchTemplates().catch(() => undefined)}
                  disabled={isLoading}
                  className="grid size-8 place-items-center rounded-md border border-subtle bg-surface-1 text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={t("workspace_templates.requirements.list.refresh")}
                >
                  <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
                </button>
              </Tooltip>
              <CustomMenu
                placement="bottom-end"
                customButton={
                  <Tooltip tooltipContent={t("workspace_templates.requirements.list.more")}>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-md border border-subtle bg-surface-1 text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
                      aria-label={t("workspace_templates.requirements.list.more")}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </Tooltip>
                }
              >
                <CustomMenu.MenuItem onClick={resetView}>
                  <RotateCcw className="size-3.5" />
                  {t("workspace_templates.requirements.list.reset_view")}
                </CustomMenu.MenuItem>
                <CustomMenu.MenuItem onClick={() => void fetchTemplates().catch(() => undefined)}>
                  <RefreshCw className="size-3.5" />
                  {t("workspace_templates.requirements.list.refresh")}
                </CustomMenu.MenuItem>
              </CustomMenu>
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
          <div className="min-w-[1060px] flex-1 overflow-hidden">
            <div className="grid grid-cols-[44px_minmax(180px,1.15fr)_minmax(220px,1.65fr)_150px_150px_150px_130px_56px] items-center gap-3 border-b border-subtle bg-layer-1 px-3 py-2.5">
              {SKELETON_COLUMNS.map((column) => (
                <Loader.Item key={column} height="14px" />
              ))}
            </div>
            {SKELETON_ROWS.map((row) => (
              <div
                key={row}
                className="grid grid-cols-[44px_minmax(180px,1.15fr)_minmax(220px,1.65fr)_150px_150px_150px_130px_56px] items-center gap-3 border-b border-subtle px-3 py-3"
              >
                {SKELETON_COLUMNS.map((column, index) => (
                  <Loader.Item key={column} height={index === 0 || index === 7 ? "16px" : "20px"} />
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
              <table className="w-full min-w-[1060px] table-fixed border-collapse text-left">
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
                    <th className="w-[18%] px-3 py-2.5">{t("workspace_templates.requirements.fields.name")}</th>
                    <th className="w-[26%] px-3 py-2.5">{t("workspace_templates.requirements.fields.description")}</th>
                    <th className="w-[13%] px-3 py-2.5">{t("workspace_templates.requirements.fields.owner")}</th>
                    <th className="w-[13%] px-3 py-2.5">{t("workspace_templates.requirements.fields.status")}</th>
                    <th className="w-[13%] px-3 py-2.5">{t("workspace_templates.requirements.approval.type")}</th>
                    <th className="w-[11%] px-3 py-2.5">{t("workspace_templates.requirements.list.updated_at")}</th>
                    <th className="w-14 px-3 py-2.5">{t("workspace_templates.requirements.fields.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTemplates.map((template) => {
                    const isSelected = selectedTemplateIds.includes(template.id);
                    const description = template.description_html
                      ? stripAndTruncateHTML(template.description_html, 180)
                      : t("workspace_templates.requirements.list.no_description");
                    const approvalLabel =
                      template.approval_type === "n_of_m"
                        ? t("workspace_templates.requirements.list.n_of_m", {
                            count: template.required_count ?? 1,
                          })
                        : t(`workspace_templates.requirements.approval.${template.approval_type}`);
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
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex min-w-0 items-center gap-2">
                            <Avatar
                              size="sm"
                              name={template.owner_detail?.display_name}
                              src={getFileURL(template.owner_detail?.avatar_url ?? "")}
                              showTooltip={false}
                            />
                            <span className="truncate text-12 text-primary">
                              {template.owner_detail?.display_name ?? "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[template.status]}`} />
                            <span className="truncate text-12 text-primary">
                              {t(`workspace_templates.requirements.statuses.${template.status}`)}
                            </span>
                            <span className="shrink-0 text-11 text-tertiary">
                              ·{" "}
                              {t(
                                template.is_active
                                  ? "workspace_templates.requirements.active"
                                  : "workspace_templates.requirements.inactive"
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <span className="block truncate text-12 text-secondary">{approvalLabel}</span>
                        </td>
                        <td className="px-3 py-2.5 text-11 text-secondary">{calculateTimeAgo(template.updated_at)}</td>
                        <td
                          className="px-3 py-2.5 text-center align-middle"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Tooltip tooltipContent={t("delete")}>
                            <button
                              type="button"
                              onClick={() => setTemplatesToDelete([template])}
                              className="grid size-7 place-items-center rounded-md text-tertiary transition-colors hover:bg-danger-subtle hover:text-danger-primary"
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
