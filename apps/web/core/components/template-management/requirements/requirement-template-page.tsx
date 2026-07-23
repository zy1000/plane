import { useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { ChevronDown, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Breadcrumbs, CustomMenu, Header, Loader } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useRequirementTemplateDetails } from "@/hooks/store/use-requirement-template-details";
import { RequirementDetailGrid } from "./requirement-detail-grid";
import { useRequirementTemplatesContext } from "./context";

export const RequirementTemplatePage = observer(function RequirementTemplatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { templateId } = useParams();
  const [isDataEditing, setIsDataEditing] = useState(false);
  const {
    workspaceSlug,
    templates,
    isLoading: isTemplatesLoading,
    isMutating: isTemplateMutating,
    deleteTemplate,
    upsertTemplate,
    setIsCreateModalOpen,
  } = useRequirementTemplatesContext();
  const detailsStore = useRequirementTemplateDetails({
    workspaceSlug,
    templateId,
    onTemplateUpdate: upsertTemplate,
  });
  const template = detailsStore.configuration?.requirement ?? templates.find((item) => item.id === templateId);

  const handleDelete = async () => {
    if (!template || !window.confirm(t("workspace_templates.requirements.delete_confirm"))) return;
    try {
      await deleteTemplate(template.id);
      navigate(`/${workspaceSlug}/templates/requirements`, { replace: true });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_templates.requirements.toast.deleted"),
      });
    } catch (error) {
      const payload = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("workspace_templates.requirements.toast.failed"),
      });
    }
  };

  const isLoading = isTemplatesLoading || detailsStore.isConfigurationLoading;
  const pageTitle = template?.title ?? t("workspace_templates.requirements.title");

  return (
    <>
      <PageHead title={`${pageTitle} - ${t("workspace_templates.title")}`} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem className="min-w-0">
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      href={`/${workspaceSlug}/templates/requirements`}
                      label={t("workspace_templates.requirements.title")}
                      icon={<FileText className="size-4 text-secondary" />}
                    />
                  }
                />
                <Breadcrumbs.Item
                  component={
                    <div className="flex min-w-0 items-center gap-2">
                      {isLoading ? (
                        <Loader className="w-44">
                          <Loader.Item height="24px" />
                        </Loader>
                      ) : (
                        <label className="relative min-w-0">
                          <select
                            value={templateId ?? ""}
                            disabled={isDataEditing}
                            onChange={(event) => {
                              if (!event.target.value) return;
                              navigate(`/${workspaceSlug}/templates/requirements/${event.target.value}`);
                            }}
                            className="h-7 max-w-72 appearance-none truncate rounded-md border border-transparent bg-transparent pr-7 pl-1 text-13 font-medium text-primary outline-none hover:border-subtle hover:bg-layer-transparent-hover disabled:cursor-not-allowed disabled:opacity-60"
                            aria-label={t("workspace_templates.requirements.switch_template")}
                          >
                            {templates.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.title}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-secondary" />
                        </label>
                      )}
                      {template && (
                        <span
                          className={
                            template.is_active
                              ? "shrink-0 rounded bg-success-subtle px-1.5 py-0.5 text-10 text-success-primary"
                              : "shrink-0 rounded bg-layer-2 px-1.5 py-0.5 text-10 text-secondary"
                          }
                        >
                          {t(
                            template.is_active
                              ? "workspace_templates.requirements.active"
                              : "workspace_templates.requirements.inactive"
                          )}
                        </span>
                      )}
                    </div>
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem className="gap-2">
              <Button variant="secondary" onClick={() => setIsCreateModalOpen(true)} disabled={isDataEditing}>
                <Plus className="size-3.5" />
                {t("workspace_templates.requirements.create")}
              </Button>
              <Button
                variant={isDataEditing ? "secondary" : "primary"}
                disabled={!templateId || isLoading || isDataEditing}
                onClick={() => navigate(`/${workspaceSlug}/templates/requirements/${templateId}/edit`)}
              >
                <Pencil className="size-3.5" />
                {t("workspace_templates.requirements.edit")}
              </Button>
              <CustomMenu ellipsis placement="bottom-end">
                <CustomMenu.MenuItem
                  onClick={() => void handleDelete()}
                  disabled={!template || isTemplateMutating || isDataEditing}
                >
                  <Trash2 className="size-3.5" />
                  {t("delete")}
                </CustomMenu.MenuItem>
              </CustomMenu>
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        {detailsStore.configurationError && !detailsStore.configuration ? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div>
              <p className="text-13 font-medium text-primary">{t("workspace_templates.requirements.error.title")}</p>
              <p className="mt-1 max-w-sm text-12 text-secondary">{detailsStore.configurationError}</p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => void detailsStore.fetchConfiguration().catch(() => undefined)}
              >
                {t("retry")}
              </Button>
            </div>
          </div>
        ) : (
          <RequirementDetailGrid
            workspaceSlug={workspaceSlug}
            templateId={templateId ?? ""}
            expectedUpdatedAt={detailsStore.configuration?.requirement.updated_at}
            fields={detailsStore.configuration?.fields ?? []}
            details={detailsStore.detailsPage.results}
            totalCount={detailsStore.detailsPage.total_count ?? 0}
            totalPages={detailsStore.detailsPage.total_pages ?? 0}
            nextCursor={detailsStore.detailsPage.next_cursor}
            prevCursor={detailsStore.detailsPage.prev_cursor}
            nextPageResults={detailsStore.detailsPage.next_page_results}
            prevPageResults={detailsStore.detailsPage.prev_page_results}
            isLoading={isLoading || detailsStore.isDetailsLoading}
            isMutating={detailsStore.isMutating}
            error={detailsStore.detailsError}
            search={detailsStore.search}
            filters={detailsStore.filters}
            perPage={detailsStore.perPage}
            onSearchChange={detailsStore.setSearch}
            onFiltersChange={detailsStore.setFilters}
            onPerPageChange={detailsStore.setPerPage}
            onCursorChange={detailsStore.setCursor}
            onRefresh={detailsStore.fetchDetails}
            onBulkSave={detailsStore.saveDetailBatch}
            onEditingChange={setIsDataEditing}
          />
        )}
      </ContentWrapper>
    </>
  );
});
