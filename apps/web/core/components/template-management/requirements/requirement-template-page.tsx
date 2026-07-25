import { useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { ChevronDown, FileText, Settings } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Breadcrumbs, Header, Loader, Tooltip } from "@plane/ui";
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
  const { workspaceSlug, templates, isLoading: isTemplatesLoading, upsertTemplate } = useRequirementTemplatesContext();
  const detailsStore = useRequirementTemplateDetails({
    workspaceSlug,
    templateId,
    onTemplateUpdate: upsertTemplate,
  });
  const template = detailsStore.configuration?.requirement ?? templates.find((item) => item.id === templateId);

  const isLoading = isTemplatesLoading || detailsStore.isConfigurationLoading;
  const pageTitle = template?.title ?? t("workspace_templates.requirements.title");
  const canConfigureTemplate = Boolean(templateId) && !isLoading && !isDataEditing;

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
                        <>
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
                          <Tooltip tooltipContent={t("workspace_templates.requirements.edit")} position="bottom">
                            <button
                              type="button"
                              disabled={!canConfigureTemplate}
                              onClick={() => navigate(`/${workspaceSlug}/templates/requirements/${templateId}/edit`)}
                              className="ml-1 flex size-6 flex-shrink-0 items-center justify-center rounded text-tertiary transition-colors hover:bg-surface-2 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label={t("workspace_templates.requirements.edit")}
                            >
                              <Settings className="size-3.5" />
                            </button>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
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
            requirementId={templateId ?? ""}
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
