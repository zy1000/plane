import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useSearchParams } from "react-router";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  Plus,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EUserWorkspaceRoles, type TRequirement } from "@plane/types";
import { AlertModalCore, Avatar, Breadcrumbs, CustomMenu, Header, Loader } from "@plane/ui";
import { calculateTimeAgo, getFileURL, stripAndTruncateHTML } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useProductMembers } from "@/hooks/store/use-product-members";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useProductsContext } from "../context";
import { useProductRequirementsContext } from "./context";
import { ProductRequirementFilters } from "./requirement-filters";
import { ProductRequirementModal } from "./requirement-modal";
import { ProductRequirementSearch } from "./requirement-search";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
    page,
    perPage,
    totalPages,
    setSearch,
    setStatusFilters,
    setOwnerFilters,
    setPage,
    setPerPage,
    fetchRequirements,
    deleteRequirement,
    openCreateModal,
    openEditModal,
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
  const peekId = searchParams.get("peekRequirement");
  const peekedRequirement = requirements.find((item) => item.id === peekId) ?? null;

  const ownerOptions = useMemo(() => {
    const byId = new Map(requirements.map((item) => [item.owner_id, item.owner_detail]));
    return Array.from(byId.values());
  }, [requirements]);

  const setPeekRequirement = (requirementId?: string) => {
    const next = new URLSearchParams(searchParams);
    if (requirementId) next.set("peekRequirement", requirementId);
    else next.delete("peekRequirement");
    setSearchParams(next, { replace: true });
  };

  const openRequirement = (requirement: TRequirement, tab: "data" | "configuration" = "data") =>
    navigate(`/${workspaceSlug}/products/${productId}/requirements/${requirement.id}?tab=${tab}`);

  const handleDelete = async () => {
    if (!requirementToDelete) return;
    try {
      await deleteRequirement(requirementToDelete.id);
      if (peekId === requirementToDelete.id) setPeekRequirement();
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
                      icon={<FileText className="size-4 text-secondary" />}
                      isLast
                    />
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem>
              <div className="flex items-center gap-2">
                <ProductRequirementSearch value={search} onSearch={setSearch} />
                <ProductRequirementFilters
                  statusFilters={statusFilters}
                  ownerFilters={ownerFilters}
                  ownerOptions={ownerOptions}
                  onStatusFiltersChange={setStatusFilters}
                  onOwnerFiltersChange={setOwnerFilters}
                />
                {canMaintain && (
                  <Button variant="primary" onClick={openCreateModal}>
                    <Plus className="size-3.5" />
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
                <table className="w-full min-w-[1080px] border-collapse text-left">
                  <thead className="sticky top-0 z-[1] bg-layer-1 text-11 font-medium text-secondary">
                    <tr className="border-b border-subtle">
                      <th className="min-w-64 px-4 py-2.5">{t("workspace_products.requirements.fields.title")}</th>
                      <th className="w-28 px-3 py-2.5">{t("workspace_products.requirements.fields.status")}</th>
                      <th className="w-44 px-3 py-2.5">{t("workspace_products.requirements.fields.owner")}</th>
                      <th className="w-44 px-3 py-2.5">{t("workspace_products.requirements.fields.approval")}</th>
                      <th className="w-24 px-3 py-2.5 text-right">
                        {t("workspace_products.requirements.fields.field_count")}
                      </th>
                      <th className="w-24 px-3 py-2.5 text-right">
                        {t("workspace_products.requirements.fields.detail_count")}
                      </th>
                      <th className="w-28 px-3 py-2.5">{t("workspace_products.requirements.fields.updated_at")}</th>
                      <th className="w-12 px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRequirements.map((requirement) => (
                      <tr
                        key={requirement.id}
                        // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- An interactive table row cannot be replaced by a button without invalid table markup.
                        role="button"
                        tabIndex={0}
                        onClick={() => setPeekRequirement(requirement.id)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
                          event.preventDefault();
                          setPeekRequirement(requirement.id);
                        }}
                        aria-label={t("workspace_products.requirements.preview.open", {
                          name: requirement.title,
                        })}
                        className="cursor-pointer border-b border-subtle/70 text-12 hover:bg-layer-transparent-hover"
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openRequirement(requirement);
                            }}
                            className="block max-w-sm truncate text-left font-medium text-primary hover:text-accent-primary"
                          >
                            {requirement.title}
                          </button>
                          <p className="mt-0.5 max-w-sm truncate text-11 text-tertiary">
                            {requirement.description_html
                              ? stripAndTruncateHTML(requirement.description_html, 100)
                              : t("workspace_products.requirements.fields.no_description")}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-layer-2 px-2 py-1 text-10 font-medium text-secondary">
                            {t(`workspace_products.requirements.status.${requirement.status}`)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <Avatar
                              name={requirement.owner_detail.display_name}
                              src={getFileURL(requirement.owner_detail.avatar_url ?? "")}
                              size="sm"
                            />
                            <span className="truncate">{requirement.owner_detail.display_name}</span>
                          </span>
                        </td>
                        <td className="truncate px-3 py-3 text-secondary">{approvalSummary(requirement, t)}</td>
                        <td className="px-3 py-3 text-right text-secondary tabular-nums">{requirement.field_count}</td>
                        <td className="px-3 py-3 text-right text-secondary tabular-nums">{requirement.detail_count}</td>
                        <td className="px-3 py-3 text-11 text-tertiary">{calculateTimeAgo(requirement.updated_at)}</td>
                        <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                          <CustomMenu
                            ellipsis
                            closeOnSelect
                            placement="bottom-end"
                            buttonClassName="text-tertiary hover:text-primary"
                          >
                            <CustomMenu.MenuItem
                              className="flex items-center gap-2"
                              onClick={() => openRequirement(requirement, "data")}
                            >
                              <Database className="size-3.5 shrink-0" />
                              {t("workspace_products.requirements.actions.open_data")}
                            </CustomMenu.MenuItem>
                            <CustomMenu.MenuItem
                              className="flex items-center gap-2"
                              onClick={() => openRequirement(requirement, "configuration")}
                            >
                              <Settings2 className="size-3.5 shrink-0" />
                              {t("workspace_products.requirements.actions.configure")}
                            </CustomMenu.MenuItem>
                            {requirement.can_edit && (
                              <>
                                <CustomMenu.MenuItem
                                  className="flex items-center gap-2"
                                  onClick={() => openEditModal(requirement)}
                                >
                                  <FileText className="size-3.5 shrink-0" />
                                  {t("workspace_products.requirements.actions.edit")}
                                </CustomMenu.MenuItem>
                                <CustomMenu.MenuItem
                                  className="flex items-center gap-2"
                                  onClick={() => setRequirementToDelete(requirement)}
                                >
                                  <X className="size-3.5 shrink-0" />
                                  {t("workspace_products.requirements.actions.delete")}
                                </CustomMenu.MenuItem>
                              </>
                            )}
                          </CustomMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <footer className="flex shrink-0 items-center justify-between border-t border-subtle px-4 py-2.5 text-11 text-secondary">
                <span>
                  {t("workspace_products.requirements.pagination.total", { count: filteredRequirements.length })}
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={perPage}
                    onChange={(event) => setPerPage(Number(event.target.value))}
                    className="h-7 rounded border border-subtle bg-surface-1 px-1.5 outline-none"
                  >
                    {PAGE_SIZE_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="grid size-7 place-items-center rounded border border-subtle disabled:opacity-40"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span>{t("workspace_products.requirements.pagination.page", { page, total: totalPages })}</span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="grid size-7 place-items-center rounded border border-subtle disabled:opacity-40"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </footer>
            </>
          )}
        </main>

        {peekedRequirement && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-10 bg-backdrop md:hidden"
              onClick={() => setPeekRequirement()}
              aria-label={t("close")}
            />
            <aside className="fixed inset-y-0 right-0 z-20 flex w-[min(92vw,390px)] flex-col border-l border-subtle bg-surface-1 shadow-raised-200 md:relative md:inset-auto md:z-auto md:w-96 md:shadow-none">
              <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
                <p className="text-11 font-semibold tracking-wide text-tertiary uppercase">
                  {t("workspace_products.requirements.preview.title")}
                </p>
                <button
                  type="button"
                  onClick={() => setPeekRequirement()}
                  className="grid size-7 place-items-center rounded text-secondary hover:bg-layer-transparent-hover"
                  aria-label={t("close")}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <span className="rounded-full bg-layer-2 px-2 py-1 text-10 font-medium text-secondary">
                  {t(`workspace_products.requirements.status.${peekedRequirement.status}`)}
                </span>
                <h2 className="text-17 mt-3 leading-6 font-semibold text-primary">{peekedRequirement.title}</h2>
                <p className="mt-2 text-12 leading-5 text-secondary">
                  {peekedRequirement.description_html
                    ? stripAndTruncateHTML(peekedRequirement.description_html, 500)
                    : t("workspace_products.requirements.fields.no_description")}
                </p>
                <dl className="mt-6 space-y-4 border-t border-subtle pt-5 text-12">
                  <div>
                    <dt className="text-11 text-tertiary">{t("workspace_products.requirements.fields.owner")}</dt>
                    <dd className="mt-1 font-medium text-primary">{peekedRequirement.owner_detail.display_name}</dd>
                  </div>
                  <div>
                    <dt className="text-11 text-tertiary">{t("workspace_products.requirements.fields.approval")}</dt>
                    <dd className="mt-1 font-medium text-primary">{approvalSummary(peekedRequirement, t)}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-subtle bg-layer-1 p-3">
                      <dt className="text-10 text-tertiary">
                        {t("workspace_products.requirements.fields.field_count")}
                      </dt>
                      <dd className="mt-1 text-18 font-semibold text-primary tabular-nums">
                        {peekedRequirement.field_count}
                      </dd>
                    </div>
                    <div className="rounded-md border border-subtle bg-layer-1 p-3">
                      <dt className="text-10 text-tertiary">
                        {t("workspace_products.requirements.fields.detail_count")}
                      </dt>
                      <dd className="mt-1 text-18 font-semibold text-primary tabular-nums">
                        {peekedRequirement.detail_count}
                      </dd>
                    </div>
                  </div>
                </dl>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-subtle p-4">
                <Button variant="secondary" onClick={() => openRequirement(peekedRequirement, "configuration")}>
                  <Settings2 className="size-3.5" />
                  {t("workspace_products.requirements.actions.configure")}
                </Button>
                <Button variant="primary" onClick={() => openRequirement(peekedRequirement, "data")}>
                  <Database className="size-3.5" />
                  {t("workspace_products.requirements.actions.open_data")}
                </Button>
              </div>
            </aside>
          </>
        )}
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
