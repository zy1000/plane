import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ChevronLeft, Database, FileText, GitBranch, History, Save, Settings2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirement, TRequirementField, TRequirementFieldDraft, IUserLite } from "@plane/types";
import { AlertModalCore, Breadcrumbs, Header, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { RequirementDetailGrid } from "@/components/template-management/requirements/requirement-detail-grid";
import { RequirementFieldBuilder } from "@/components/template-management/requirements/requirement-field-builder";
import { hasValidRequirementSelectOptions } from "@/components/template-management/requirements/requirement-select";
import { useProductMembers } from "@/hooks/store/use-product-members";
import { useRequirementChangeRequests } from "@/hooks/store/use-requirement-changes";
import { useRequirementDetails } from "@/hooks/store/use-requirement-template-details";
import { useUser } from "@/hooks/store/user";
import { RequirementChangesTab } from "./change/requirement-changes-tab";
import { RequirementStatusActions, RequirementStatusMeta } from "./change/requirement-status-actions";
import { SubmitChangeModal } from "./change/submit-change-modal";
import { useRequirementStateActions } from "./change/use-requirement-state-actions";
import { VersionHistory } from "./change/version-history";
import { useProductRequirementsContext } from "./context";
import { ReadOnlyFieldStructure, ReadOnlyRequirementSettings } from "./requirement-read-only-configuration";
import {
  RequirementConfigurationNavigation,
  RequirementSettingsPanel,
  type TRequirementConfigurationSection,
  type TRequirementSettingsDraft,
} from "./requirement-settings-panel";

const TABS = ["data", "configuration", "changes", "versions"] as const;

type TRequirementDetailTab = (typeof TABS)[number];

const toDraftField = (field: TRequirementField): TRequirementFieldDraft => ({
  id: field.id,
  client_id: field.client_id,
  name: field.name,
  field_type: field.field_type,
  is_required: field.is_required,
  is_active: field.is_active,
  config: { ...field.config },
  default_value: field.default_value,
  children: field.children.map(toDraftField),
});

const serializeFields = (fields: TRequirementFieldDraft[]) => JSON.stringify(fields);

const toSettingsDraft = (requirement: TRequirement): TRequirementSettingsDraft => ({
  title: requirement.title,
  description_html: requirement.description_html,
  owner_id: requirement.owner_id,
  status: requirement.status,
  approver_ids: requirement.approver_ids,
  approval_type: requirement.approval_type,
  required_count: requirement.required_count,
});

const serializeSettings = (settings: TRequirementSettingsDraft) => JSON.stringify(settings);

export const ProductRequirementDetailPage = observer(function ProductRequirementDetailPage() {
  const { t } = useTranslation();
  const { requirementId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { workspaceSlug, productId, requirements, upsertRequirement } = useProductRequirementsContext();
  const { members } = useProductMembers(workspaceSlug, productId);
  const { data: currentUser } = useUser();
  const [isDataEditing, setIsDataEditing] = useState(false);
  const [dataToolbarHost, setDataToolbarHost] = useState<HTMLDivElement | null>(null);
  const [configurationSection, setConfigurationSection] = useState<TRequirementConfigurationSection>("settings");
  const [draftFields, setDraftFields] = useState<TRequirementFieldDraft[]>([]);
  const [fieldBaseline, setFieldBaseline] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<TRequirementSettingsDraft | null>(null);
  const [settingsBaseline, setSettingsBaseline] = useState("");
  const detailsStore = useRequirementDetails({
    workspaceSlug,
    requirementId,
    onRequirementUpdate: upsertRequirement,
  });
  const requirement = detailsStore.configuration?.requirement ?? requirements.find((item) => item.id === requirementId);
  const requestedTab = searchParams.get("tab") as TRequirementDetailTab | null;
  const activeTab: TRequirementDetailTab = requestedTab && TABS.includes(requestedTab) ? requestedTab : "data";
  const openedChangeRequestId = searchParams.get("cr");
  const canEdit = Boolean(requirement?.can_edit);
  /**
   * 只有草稿态可写，与后端 READ_ONLY_REASONS 一致：已发布内容要先点「编辑」生成工作
   * 副本，审批期草稿已被冻结成变更单快照。否则用户能进编辑态但保存拿到 409。
   */
  const isEditable = canEdit && requirement?.status === "draft";
  const configurationReadOnlyHint = t(
    !canEdit
      ? "workspace_products.requirements.configuration.read_only"
      : requirement?.status === "in_review"
        ? "workspace_products.requirements.configuration.read_only_in_review"
        : "workspace_products.requirements.configuration.read_only_published"
  );
  const changesStore = useRequirementChangeRequests({
    workspaceSlug,
    requirementId,
    onRequirementUpdate: upsertRequirement,
  });
  const pendingChangeRequest = changesStore.changeRequestsPage.results.find((item) => item.status === "pending");
  const pendingCount = changesStore.changeRequestsPage.results.filter((item) => item.status === "pending").length;
  const memberOptions = useMemo(() => {
    const byId = new Map<string, IUserLite>();
    members.forEach((membership) => byId.set(membership.member, membership.member_detail));
    if (requirement?.owner_detail) byId.set(requirement.owner_id, requirement.owner_detail);
    requirement?.approver_details.forEach((member) => byId.set(member.id, member));
    if (currentUser) byId.set(currentUser.id, currentUser);
    return Array.from(byId.values());
  }, [currentUser, members, requirement]);
  const areFieldsDirty = useMemo(
    () => Boolean(fieldBaseline && serializeFields(draftFields) !== fieldBaseline),
    [draftFields, fieldBaseline]
  );
  const areSettingsDirty = useMemo(
    () => Boolean(settingsBaseline && settingsDraft && serializeSettings(settingsDraft) !== settingsBaseline),
    [settingsBaseline, settingsDraft]
  );
  const isDirty = areFieldsDirty || areSettingsDirty;

  useEffect(() => {
    if (!detailsStore.configuration) return;
    const nextFields = detailsStore.configuration.fields.map(toDraftField);
    const nextSettings = toSettingsDraft(detailsStore.configuration.requirement);
    setDraftFields(nextFields);
    setFieldBaseline(serializeFields(nextFields));
    setSettingsDraft(nextSettings);
    setSettingsBaseline(serializeSettings(nextSettings));
  }, [detailsStore.configuration]);

  const setTab = (tab: TRequirementDetailTab) => {
    if (isDataEditing || (activeTab === "configuration" && isDirty)) return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    next.delete("cr");
    setSearchParams(next, { replace: true });
  };

  const openChangeRequest = (changeRequestId: string | null) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "changes");
    if (changeRequestId) next.set("cr", changeRequestId);
    else next.delete("cr");
    setSearchParams(next, { replace: true });
  };

  const refreshLayer = () => {
    void detailsStore.fetchConfiguration().catch(() => undefined);
    void detailsStore.fetchDetails().catch(() => undefined);
  };

  const stateActions = useRequirementStateActions({
    requirement,
    changesStore,
    pendingChangeRequestId: pendingChangeRequest?.id ?? null,
    onLayerChanged: refreshLayer,
    onDeleted: () => navigate(`/${workspaceSlug}/products/${productId}/requirements`),
    onSubmitted: () => setTab("changes"),
  });

  const saveConfiguration = async (confirmDataLoss = false) => {
    if (!detailsStore.configuration || !requirement || !settingsDraft) return;
    if (!settingsDraft.title.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_products.requirements.validation.title"),
      });
      setConfigurationSection("settings");
      return;
    }
    if (!settingsDraft.owner_id) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_products.requirements.validation.owner"),
      });
      setConfigurationSection("settings");
      return;
    }
    if (
      settingsDraft.approver_ids.length > 0 &&
      settingsDraft.approval_type === "n_of_m" &&
      (!settingsDraft.required_count ||
        settingsDraft.required_count < 1 ||
        settingsDraft.required_count > settingsDraft.approver_ids.length)
    ) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_products.requirements.validation.required_count"),
      });
      setConfigurationSection("settings");
      return;
    }
    const allFields = draftFields.flatMap((field) => [field, ...field.children]);
    if (allFields.some((field) => !field.name.trim())) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_templates.requirements.validation.field_name"),
      });
      setConfigurationSection("fields");
      return;
    }
    if (allFields.some((field) => field.field_type === "select" && !hasValidRequirementSelectOptions(field))) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_templates.requirements.validation.selector_options"),
      });
      setConfigurationSection("fields");
      return;
    }
    try {
      const response = await detailsStore.updateConfiguration({
        expected_updated_at: detailsStore.configuration.requirement.updated_at,
        requirement: {
          title: settingsDraft.title.trim(),
          description_html: settingsDraft.description_html,
          owner_id: settingsDraft.owner_id,
          status: settingsDraft.status,
          approver_ids: settingsDraft.approver_ids,
          approval_type: settingsDraft.approver_ids.length ? settingsDraft.approval_type : "any",
          required_count:
            settingsDraft.approver_ids.length && settingsDraft.approval_type === "n_of_m"
              ? settingsDraft.required_count
              : null,
        },
        fields: draftFields,
        confirm_data_loss: confirmDataLoss,
      });
      const nextFields = response.fields.map(toDraftField);
      const nextSettings = toSettingsDraft(response.requirement);
      setDraftFields(nextFields);
      setFieldBaseline(serializeFields(nextFields));
      setSettingsDraft(nextSettings);
      setSettingsBaseline(serializeSettings(nextSettings));
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_products.requirements.toast.configuration_saved"),
      });
    } catch (error) {
      const payload = error as { code?: string; error?: string; affected_detail_count?: number };
      if (
        payload?.code === "REQUIREMENT_SCHEMA_DATA_LOSS" &&
        !confirmDataLoss &&
        window.confirm(
          t("workspace_templates.requirements.editor.data_loss_confirm", {
            count: payload.affected_detail_count ?? 0,
          })
        )
      ) {
        await saveConfiguration(true);
        return;
      }
      if (payload?.code === "REQUIREMENT_CONFIGURATION_CONFLICT") {
        await detailsStore.fetchConfiguration().catch(() => undefined);
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("workspace_products.requirements.toast.failed"),
      });
    }
  };

  const isLoading = detailsStore.isConfigurationLoading || !requirement;

  return (
    <>
      <PageHead title={requirement?.title ?? t("workspace_products.navigation.requirements")} />
      <AppHeader
        rowClassName="h-[52px]"
        header={
          <Header className="min-w-0">
            <Header.LeftItem className="max-w-none min-w-0 flex-nowrap">
              <button
                type="button"
                onClick={() => navigate(`/${workspaceSlug}/products/${productId}/requirements`)}
                className="grid h-11 w-7 shrink-0 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent-strong"
                aria-label={t("common.back")}
              >
                <ChevronLeft className="size-4" />
              </button>
              <Breadcrumbs className="min-w-0 flex-grow-0">
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      href={`/${workspaceSlug}/products/${productId}/requirements`}
                      label={t("workspace_products.navigation.requirements")}
                      icon={<FileText className="size-4 text-tertiary" />}
                    />
                  }
                />
                <Breadcrumbs.Item
                  component={
                    isLoading ? (
                      <Loader className="w-40">
                        <Loader.Item height="22px" />
                      </Loader>
                    ) : (
                      <BreadcrumbLink label={requirement.title} isLast />
                    )
                  }
                  isLast
                />
              </Breadcrumbs>
              {requirement && <RequirementStatusMeta requirement={requirement} className="hidden sm:flex" />}
            </Header.LeftItem>
            <Header.RightItem className="shrink-0 gap-2">
              {activeTab === "configuration" && isEditable && (
                <Button
                  variant="primary"
                  disabled={!isDirty}
                  loading={detailsStore.isMutating}
                  onClick={() => void saveConfiguration()}
                >
                  <Save className="size-3.5" />
                  {t("workspace_products.requirements.configuration.save")}
                </Button>
              )}
              {requirement && (
                <RequirementStatusActions
                  requirement={requirement}
                  isSubmitter={Boolean(pendingChangeRequest?.can_cancel)}
                  isMutating={changesStore.isMutating}
                  onEdit={() => void stateActions.startEditing()}
                  onSubmitReview={stateActions.openSubmitModal}
                  onDiscardDraft={stateActions.openDiscardModal}
                  onWithdrawReview={stateActions.openWithdrawModal}
                  onGoApprove={() => openChangeRequest(pendingChangeRequest?.id ?? null)}
                />
              )}
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        <nav className="flex h-11 shrink-0 items-center gap-2 overflow-hidden border-b border-subtle px-4 md:px-6">
          <div className="min-w-0 flex-1 self-stretch overflow-x-auto">
            <div className="flex h-full min-w-max items-end gap-1">
              {[
                { key: "data" as const, icon: Database, label: t("workspace_products.requirements.tabs.data") },
                {
                  key: "configuration" as const,
                  icon: Settings2,
                  label: t("workspace_products.requirements.tabs.configuration"),
                },
                { key: "changes" as const, icon: History, label: t("workspace_products.requirements.tabs.changes") },
                {
                  key: "versions" as const,
                  icon: GitBranch,
                  label: t("workspace_products.requirements.tabs.versions"),
                },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    disabled={isDataEditing || (activeTab === "configuration" && isDirty)}
                    onClick={() => setTab(tab.key)}
                    className={cn(
                      "relative flex h-11 items-center gap-1.5 px-3 text-12 transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      activeTab === tab.key
                        ? "font-medium text-accent-primary after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:bg-accent-primary"
                        : "text-secondary hover:text-primary"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {tab.label}
                    {tab.key === "changes" && pendingCount > 0 && (
                      <span className="ml-1 grid size-4 place-items-center rounded-full bg-warning-primary text-10 text-on-color">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {activeTab === "data" && (
            <div ref={setDataToolbarHost} className="ml-auto flex min-w-0 shrink-0 items-center pl-2" />
          )}
        </nav>

        {detailsStore.configurationError && !detailsStore.configuration ? (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div>
              <p className="text-13 font-medium text-primary">{t("workspace_products.requirements.error.title")}</p>
              <p className="mt-1 text-12 text-secondary">{detailsStore.configurationError}</p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => void detailsStore.fetchConfiguration().catch(() => undefined)}
              >
                {t("retry")}
              </Button>
            </div>
          </div>
        ) : activeTab === "changes" ? (
          <RequirementChangesTab
            workspaceSlug={workspaceSlug}
            requirementId={requirementId ?? ""}
            fields={detailsStore.configuration?.fields ?? []}
            members={memberOptions}
            store={changesStore}
            openedChangeRequestId={openedChangeRequestId}
            onOpenChangeRequest={openChangeRequest}
            onSettled={() => {
              refreshLayer();
              void changesStore.fetchChangeRequests().catch(() => undefined);
            }}
          />
        ) : activeTab === "versions" ? (
          requirement ? (
            <VersionHistory
              workspaceSlug={workspaceSlug}
              requirement={requirement}
              members={memberOptions}
              onRequirementUpdate={(next) => {
                upsertRequirement(next);
                refreshLayer();
              }}
            />
          ) : (
            <div className="p-6">
              <Loader>
                <Loader.Item height="420px" />
              </Loader>
            </div>
          )
        ) : activeTab === "data" ? (
          <RequirementDetailGrid
            workspaceSlug={workspaceSlug}
            entityId={requirementId ?? ""}
            readOnly={!isEditable}
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
            toolbarPortalEl={dataToolbarHost}
          />
        ) : detailsStore.isConfigurationLoading ? (
          <div className="p-6">
            <Loader>
              <Loader.Item height="420px" />
            </Loader>
          </div>
        ) : isEditable ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-subtle xl:hidden">
              <RequirementConfigurationNavigation
                activeSection={configurationSection}
                onSectionChange={setConfigurationSection}
                orientation="horizontal"
              />
            </div>

            {configurationSection === "settings" ? (
              <div className="flex min-h-0 flex-1">
                <aside className="hidden w-52 shrink-0 border-r border-subtle bg-surface-1 xl:block">
                  <RequirementConfigurationNavigation
                    activeSection={configurationSection}
                    onSectionChange={setConfigurationSection}
                  />
                </aside>
                {settingsDraft ? (
                  <RequirementSettingsPanel
                    draft={settingsDraft}
                    currentVersion={requirement?.current_version ?? null}
                    memberOptions={memberOptions}
                    onChange={setSettingsDraft}
                  />
                ) : (
                  <div className="min-w-0 flex-1 p-6">
                    <Loader>
                      <Loader.Item height="420px" />
                    </Loader>
                  </div>
                )}
              </div>
            ) : (
              <RequirementFieldBuilder
                fields={draftFields}
                onChange={setDraftFields}
                compactLayout
                title={t("workspace_products.requirements.configuration.custom_fields")}
                description={t("workspace_products.requirements.configuration.custom_fields_description")}
                sidebarHeader={
                  <div className="shrink-0 border-b border-subtle">
                    <RequirementConfigurationNavigation
                      activeSection={configurationSection}
                      onSectionChange={setConfigurationSection}
                    />
                  </div>
                }
              />
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-subtle xl:hidden">
              <RequirementConfigurationNavigation
                activeSection={configurationSection}
                onSectionChange={setConfigurationSection}
                orientation="horizontal"
              />
            </div>
            <div className="flex min-h-0 flex-1">
              <aside className="hidden w-52 shrink-0 border-r border-subtle bg-surface-1 xl:block">
                <RequirementConfigurationNavigation
                  activeSection={configurationSection}
                  onSectionChange={setConfigurationSection}
                />
              </aside>
              {configurationSection === "settings" && requirement ? (
                <ReadOnlyRequirementSettings requirement={requirement} hint={configurationReadOnlyHint} />
              ) : (
                <ReadOnlyFieldStructure
                  fields={detailsStore.configuration?.fields ?? []}
                  hint={configurationReadOnlyHint}
                />
              )}
            </div>
          </div>
        )}
      </ContentWrapper>

      <SubmitChangeModal
        isOpen={stateActions.isSubmitModalOpen}
        isSubmitting={changesStore.isMutating}
        onClose={stateActions.closeSubmitModal}
        onSubmit={(reason) => void stateActions.submitReview(reason)}
      />
      <AlertModalCore
        isOpen={stateActions.isDiscardModalOpen}
        isSubmitting={changesStore.isMutating}
        handleClose={stateActions.closeDiscardModal}
        handleSubmit={() => void stateActions.discardDraft()}
        title={t(
          stateActions.hasPublishedVersion
            ? "workspace_products.requirements.state.discard_draft_title"
            : "workspace_products.requirements.state.delete_requirement_title"
        )}
        content={
          stateActions.hasPublishedVersion
            ? t("workspace_products.requirements.state.discard_draft_description", {
                version: requirement?.current_version ?? "",
              })
            : t("workspace_products.requirements.state.delete_requirement_description")
        }
      />
      <AlertModalCore
        isOpen={stateActions.isWithdrawModalOpen}
        isSubmitting={changesStore.isMutating}
        handleClose={stateActions.closeWithdrawModal}
        handleSubmit={() => void stateActions.withdrawReview()}
        title={t("workspace_products.requirements.state.withdraw_review_title")}
        content={t("workspace_products.requirements.state.withdraw_review_description")}
      />
    </>
  );
});
