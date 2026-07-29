import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate } from "react-router";
import { ChevronLeft, ChevronRight, FileText, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EUserWorkspaceRoles, type TRequirement } from "@plane/types";
import { AlertModalCore, Avatar, Breadcrumbs, Header, Loader } from "@plane/ui";
import { cn, getFileURL, stripAndTruncateHTML } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useProductMembers } from "@/hooks/store/use-product-members";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useProductsContext } from "../context";
import { PILL_BASE, REQUIREMENT_STATUS_PILL } from "./change/styles";
import { useProductRequirementsContext } from "./context";
import { ProductRequirementFilters } from "./requirement-filters";
import { ProductRequirementModal } from "./requirement-modal";
import { ProductRequirementSearch } from "./requirement-search";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

const formatRelativeTime = (time: string | number | Date | null, locale: string) => {
  if (!time) return "";
  const date = time instanceof Date ? time : new Date(time);
  if (Number.isNaN(date.getTime())) return "";

  const secondsFromNow = (date.getTime() - Date.now()) / 1000;
  const ranges: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
    { unit: "year", seconds: 31_536_000 },
    { unit: "month", seconds: 2_592_000 },
    { unit: "week", seconds: 604_800 },
    { unit: "day", seconds: 86_400 },
    { unit: "hour", seconds: 3_600 },
    { unit: "minute", seconds: 60 },
    { unit: "second", seconds: 1 },
  ];
  const range = ranges.find((item) => Math.abs(secondsFromNow) >= item.seconds) ?? ranges[ranges.length - 1];
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    Math.round(secondsFromNow / range.seconds),
    range.unit
  );
};

const approvalSummary = (requirement: TRequirement, t: (key: string, values?: Record<string, unknown>) => string) => {
  if (!requirement.approver_ids.length) return t("workspace_products.requirements.approval.unconfigured");
  if (requirement.approval_type === "n_of_m") {
    return t("workspace_products.requirements.approval.n_summary", {
      required: requirement.required_count ?? 1,
      total: requirement.approver_ids.length,
    });
  }
  return t(`workspace_products.requirements.approval.${requirement.approval_type}`);
};

export const ProductRequirementList = observer(function ProductRequirementList() {
  const { t, currentLocale } = useTranslation();
  const navigate = useNavigate();
  const { data: currentUser } = useUser();
  const { workspaceInfoBySlug, hasAllWorkspacePermissions } = useUserPermissions();
  const { products } = useProductsContext();
  const {
    workspaceSlug,
    productId,
    requirements,
    paginatedRequirements,
    filteredRequirements,
    isLoading,
    isMutating,
    error,
    search,
    statusFilters,
    ownerFilters,
    pendingMyApprovalOnly,
    unconfiguredApprovalOnly,
    page,
    perPage,
    totalPages,
    setSearch,
    setStatusFilters,
    setOwnerFilters,
    setPendingMyApprovalOnly,
    setUnconfiguredApprovalOnly,
    setPage,
    setPerPage,
    fetchRequirements,
    deleteRequirement,
    openCreateModal,
  } = useProductRequirementsContext();
  const { members } = useProductMembers(workspaceSlug, productId);
  const [requirementToDelete, setRequirementToDelete] = useState<TRequirement | null>(null);
  const product = products.find((item) => item.id === productId);
  const workspaceInfo = workspaceInfoBySlug(workspaceSlug);
  const isWorkspaceAdmin =
    workspaceInfo?.role === EUserWorkspaceRoles.ADMIN || hasAllWorkspacePermissions(workspaceSlug);
  const canMaintain =
    isWorkspaceAdmin ||
    product?.owner === currentUser?.id ||
    members.some((membership) => membership.member === currentUser?.id);

  const ownerOptions = useMemo(() => {
    const byId = new Map(requirements.map((item) => [item.owner_id, item.owner_detail]));
    return Array.from(byId.values());
  }, [requirements]);

  const openRequirement = (requirement: TRequirement, tab: "data" | "configuration" = "data") =>
    navigate(`/${workspaceSlug}/products/${productId}/requirements/${requirement.id}?tab=${tab}`);

  const handleDelete = async () => {
    if (!requirementToDelete) return;
    try {
      await deleteRequirement(requirementToDelete.id);
      setRequirementToDelete(null);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_products.requirements.toast.deleted"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_products.requirements.toast.failed"),
      });
    }
  };

  return (
    <>
      <PageHead title={`${t("workspace_products.navigation.requirements")} - ${product?.name ?? ""}`} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={t("workspace_products.navigation.requirements")}
                      href={`/${workspaceSlug}/products/${productId}/requirements`}
                      icon={<FileText className="size-4 text-tertiary" />}
                      isLast
                    />
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem>
              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-2 sm:flex">
                  <ProductRequirementSearch value={search} onSearch={setSearch} />
                  <ProductRequirementFilters
                    statusFilters={statusFilters}
                    ownerFilters={ownerFilters}
                    ownerOptions={ownerOptions}
                    pendingMyApprovalOnly={pendingMyApprovalOnly}
                    unconfiguredApprovalOnly={unconfiguredApprovalOnly}
                    onStatusFiltersChange={setStatusFilters}
                    onOwnerFiltersChange={setOwnerFilters}
                    onPendingMyApprovalOnlyChange={setPendingMyApprovalOnly}
                    onUnconfiguredApprovalOnlyChange={setUnconfiguredApprovalOnly}
                  />
                </div>
                {canMaintain && (
                  <Button variant="primary" size="lg" onClick={openCreateModal}>
                    {t("workspace_products.requirements.create")}
                  </Button>
                )}
              </div>
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="flex min-h-0 overflow-hidden bg-surface-1">
        <main className="flex min-w-0 flex-1 flex-col">
          {isLoading ? (
            <div className="p-4">
              <Loader className="space-y-2">
                {Array.from({ length: 7 }, (_, index) => (
                  <Loader.Item key={index} height="48px" />
                ))}
              </Loader>
            </div>
          ) : error ? (
            <div className="grid flex-1 place-items-center px-6 text-center">
              <div>
                <p className="text-13 font-medium text-primary">{t("workspace_products.requirements.error.title")}</p>
                <p className="mt-1 text-12 text-secondary">{error}</p>
                <Button
                  className="mt-3"
                  variant="secondary"
                  onClick={() => void fetchRequirements().catch(() => undefined)}
                >
                  {t("retry")}
                </Button>
              </div>
            </div>
          ) : !filteredRequirements.length ? (
            <div className="grid flex-1 place-items-center px-6 text-center">
              <div className="max-w-sm">
                <div className="mx-auto grid size-12 place-items-center rounded-xl border border-subtle bg-layer-1 text-tertiary">
                  <SlidersHorizontal className="size-5" />
                </div>
                <p className="mt-3 text-13 font-medium text-primary">
                  {requirements.length
                    ? t("workspace_products.requirements.empty.filtered")
                    : t("workspace_products.requirements.empty.title")}
                </p>
                <p className="mt-1 text-12 leading-5 text-secondary">
                  {requirements.length
                    ? t("workspace_products.requirements.empty.filtered_description")
                    : t("workspace_products.requirements.empty.description")}
                </p>
                {canMaintain && !requirements.length && (
                  <Button className="mt-4" variant="primary" onClick={openCreateModal}>
                    <Plus className="size-3.5" />
                    {t("workspace_products.requirements.create")}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[400px] border-collapse text-left sm:min-w-[520px] md:min-w-[640px]">
                  <thead className="sticky top-0 z-[2] bg-layer-1 text-13 font-medium text-secondary">
                    <tr className="border-b border-subtle">
                      <th className="min-w-64 px-4 py-3">{t("workspace_products.requirements.fields.title")}</th>
                      <th className="hidden w-28 px-3 py-3 sm:table-cell">
                        {t("workspace_products.requirements.fields.status")}
                      </th>
                      <th className="hidden w-40 px-3 py-3 md:table-cell">
                        {t("workspace_products.requirements.fields.owner")}
                      </th>
                      <th className="hidden w-44 px-3 py-3 lg:table-cell">
                        {t("workspace_products.requirements.fields.approval")}
                      </th>
                      <th className="hidden w-24 px-3 py-3 xl:table-cell">
                        {t("workspace_products.requirements.fields.field_count")}
                      </th>
                      <th className="hidden w-24 px-3 py-3 xl:table-cell">
                        {t("workspace_products.requirements.fields.detail_count")}
                      </th>
                      <th className="hidden w-28 px-3 py-3 lg:table-cell">
                        {t("workspace_products.requirements.fields.updated_at")}
                      </th>
                      <th className="sticky right-0 w-24 bg-layer-1 px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRequirements.map((requirement) => (
                      <tr
                        key={requirement.id}
                        className="group border-b border-subtle/70 text-13 hover:bg-surface-2"
                      >
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => openRequirement(requirement)}
                            className="focus-visible:outline-accent-primary block max-w-sm truncate text-left text-sm font-medium text-accent-primary hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2"
                          >
                            {requirement.title}
                          </button>
                          <p className="mt-1 max-w-sm truncate text-12 text-secondary">
                            {requirement.description_html
                              ? stripAndTruncateHTML(requirement.description_html, 100)
                              : t("workspace_products.requirements.fields.no_description")}
                          </p>
                          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-12 text-tertiary lg:hidden">
                            <span
                              className={cn(
                                PILL_BASE,
                                REQUIREMENT_STATUS_PILL[requirement.status],
                                "text-11 sm:hidden"
                              )}
                            >
                              {t(`workspace_products.requirements.status.${requirement.status}`)}
                            </span>
                            <span className="sm:hidden">·</span>
                            <span className="truncate md:hidden">{requirement.owner_detail.display_name}</span>
                            <span className="md:hidden">·</span>
                            {requirement.approver_ids.length === 0 ? (
                              <button
                                type="button"
                                onClick={() => openRequirement(requirement, "configuration")}
                                className="focus-visible:outline-accent-primary rounded-full bg-warning-subtle px-1.5 py-0.5 font-medium text-warning-primary hover:ring-1 hover:ring-warning-subtle hover:ring-inset focus-visible:outline focus-visible:outline-2"
                              >
                                {t("workspace_products.requirements.approval.unconfigured")}
                              </button>
                            ) : (
                              <span className="truncate">{approvalSummary(requirement, t)}</span>
                            )}
                            <span>·</span>
                            <span className="shrink-0">
                              {formatRelativeTime(requirement.updated_at, currentLocale)}
                            </span>
                          </div>
                        </td>
                        <td className="hidden py-3.5 pr-3 pl-1 sm:table-cell">
                          <span className="flex flex-wrap items-center justify-start gap-1 text-left">
                            <span className={cn(PILL_BASE, REQUIREMENT_STATUS_PILL[requirement.status], "text-11")}>
                              {requirement.status === "draft" && requirement.current_version !== null
                                ? t("workspace_products.requirements.status.draft_with_version", {
                                    version: requirement.current_version,
                                  })
                                : t(`workspace_products.requirements.status.${requirement.status}`)}
                            </span>
                            {requirement.can_approve && (
                              <span className={cn(PILL_BASE, "bg-warning-subtle text-11 text-warning-primary")}>
                                {t("workspace_products.requirements.status.pending_my_approval")}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="hidden px-3 py-3.5 md:table-cell">
                          <span className="flex min-w-0 items-center gap-2">
                            <Avatar
                              name={requirement.owner_detail.display_name}
                              src={getFileURL(requirement.owner_detail.avatar_url ?? "")}
                              size="sm"
                            />
                            <span className="truncate">{requirement.owner_detail.display_name}</span>
                          </span>
                        </td>
                        <td className="hidden px-3 py-3.5 text-secondary lg:table-cell">
                          {requirement.approver_ids.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => openRequirement(requirement, "configuration")}
                              className={cn(
                                PILL_BASE,
                                "focus-visible:outline-accent-primary bg-warning-subtle text-11 text-warning-primary hover:ring-1 hover:ring-warning-subtle hover:ring-inset focus-visible:outline focus-visible:outline-2"
                              )}
                            >
                              {t("workspace_products.requirements.approval.unconfigured")}
                            </button>
                          ) : (
                            <span className="block truncate">{approvalSummary(requirement, t)}</span>
                          )}
                        </td>
                        <td className="hidden px-3 py-3.5 text-secondary tabular-nums xl:table-cell">
                          {requirement.field_count}
                        </td>
                        <td className="hidden px-3 py-3.5 text-secondary tabular-nums xl:table-cell">
                          {requirement.detail_count}
                        </td>
                        <td className="hidden px-3 py-3.5 text-12 text-tertiary lg:table-cell">
                          {formatRelativeTime(requirement.updated_at, currentLocale)}
                        </td>
                        <td className="sticky right-0 bg-surface-1 px-3 py-3.5 group-hover:bg-surface-2">
                          {requirement.can_edit && (
                            <button
                              type="button"
                              onClick={() => setRequirementToDelete(requirement)}
                              className="focus-visible:outline-accent-primary grid size-8 place-items-center rounded-md text-tertiary transition-colors hover:text-danger-primary focus-visible:outline focus-visible:outline-2"
                              aria-label={t("workspace_products.requirements.actions.delete")}
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-subtle px-4 py-2.5 text-12 text-secondary">
                <span>
                  {t("workspace_products.requirements.pagination.total", { count: filteredRequirements.length })}
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={perPage}
                    onChange={(event) => setPerPage(Number(event.target.value))}
                    className="focus-visible:border-accent-subtle-1 h-8 rounded-md border border-subtle bg-surface-1 px-2 outline-none hover:bg-layer-transparent-hover focus-visible:ring-1 focus-visible:ring-accent-subtle"
                    aria-label={t("workspace_products.requirements.pagination.per_page")}
                  >
                    {PAGE_SIZE_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {t("workspace_products.requirements.pagination.per_page_value", { count: value })}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="focus-visible:outline-accent-primary grid size-8 place-items-center rounded-md border border-subtle hover:bg-layer-transparent-hover focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={t("workspace_products.requirements.pagination.previous_page")}
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span className="min-w-16 text-center tabular-nums">
                    {t("workspace_products.requirements.pagination.page", { page, total: totalPages })}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="focus-visible:outline-accent-primary grid size-8 place-items-center rounded-md border border-subtle hover:bg-layer-transparent-hover focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={t("workspace_products.requirements.pagination.next_page")}
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </footer>
            </>
          )}
        </main>
      </ContentWrapper>

      <ProductRequirementModal />
      <AlertModalCore
        isOpen={Boolean(requirementToDelete)}
        isSubmitting={isMutating}
        handleClose={() => setRequirementToDelete(null)}
        handleSubmit={() => void handleDelete()}
        title={t("workspace_products.requirements.delete.title")}
        content={t("workspace_products.requirements.delete.description", {
          name: requirementToDelete?.title ?? "",
        })}
      />
    </>
  );
});
