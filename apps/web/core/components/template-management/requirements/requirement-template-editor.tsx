import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Eye, Save, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirement, TRequirementField, TRequirementFieldDraft } from "@plane/types";
import { Header, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useRequirementTemplateDetails } from "@/hooks/store/use-requirement-template-details";
import { useRequirementTemplatesContext } from "./context";
import { RequirementFieldBuilder } from "./requirement-field-builder";
import { hasValidRequirementSelectOptions } from "./requirement-select";

type TEditorTab = "basic" | "fields";
type TRequirementMetadataDraft = Pick<TRequirement, "title" | "description_html">;

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

const fieldKey = (field: TRequirementFieldDraft) => field.id ?? field.client_id ?? "";

const serializeDraft = (metadata: TRequirementMetadataDraft, fields: TRequirementFieldDraft[]) =>
  JSON.stringify({ metadata, fields });

function RequirementFieldsPreview({ fields }: { fields: TRequirementFieldDraft[] }) {
  const { t } = useTranslation();
  const visibleFields = fields.filter((field) => field.is_active);
  const formFields = visibleFields.filter((field) => field.field_type === "form");
  const hasForms = formFields.length > 0;
  const columnCount = visibleFields.reduce((count, field) => {
    if (field.field_type !== "form") return count + 1;
    return count + Math.max(field.children.filter((child) => child.is_active).length, 1);
  }, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-subtle bg-surface-1">
      <table className="min-w-full border-collapse text-left">
        <thead className="bg-layer-1 text-11 text-secondary">
          <tr className="border-b border-subtle">
            {visibleFields.map((field) =>
              field.field_type === "form" ? (
                <th
                  key={fieldKey(field)}
                  colSpan={Math.max(field.children.filter((child) => child.is_active).length, 1)}
                  className="min-w-40 border-r border-subtle px-3 py-2 text-center text-primary"
                >
                  {field.name || t("workspace_templates.requirements.fields.untitled")}
                </th>
              ) : (
                <th
                  key={fieldKey(field)}
                  rowSpan={hasForms ? 2 : 1}
                  className="min-w-40 border-r border-subtle px-3 py-2"
                >
                  {field.name || t("workspace_templates.requirements.fields.untitled")}
                </th>
              )
            )}
          </tr>
          {hasForms && (
            <tr className="border-b border-subtle">
              {formFields.flatMap((field) => {
                const children = field.children.filter((child) => child.is_active);
                return children.length ? (
                  children.map((child) => (
                    <th key={fieldKey(child)} className="min-w-40 border-r border-subtle px-3 py-2">
                      {child.name || t("workspace_templates.requirements.fields.untitled")}
                    </th>
                  ))
                ) : (
                  <th key={`${fieldKey(field)}-empty`} className="min-w-40 border-r border-subtle px-3 py-2">
                    {t("workspace_templates.requirements.fields.no_children")}
                  </th>
                );
              })}
            </tr>
          )}
        </thead>
        <tbody>
          <tr>
            <td colSpan={Math.max(1, columnCount)} className="h-24 px-4 text-center text-11 text-placeholder">
              {t("workspace_templates.requirements.preview.empty")}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export const RequirementTemplateEditor = observer(function RequirementTemplateEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { templateId } = useParams();
  const { workspaceSlug, upsertTemplate } = useRequirementTemplatesContext();
  const detailsStore = useRequirementTemplateDetails({
    workspaceSlug,
    templateId,
    onTemplateUpdate: upsertTemplate,
  });
  const [activeTab, setActiveTab] = useState<TEditorTab>("fields");
  const [metadata, setMetadata] = useState<TRequirementMetadataDraft | null>(null);
  const [fields, setFields] = useState<TRequirementFieldDraft[]>([]);
  const [baseline, setBaseline] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    const configuration = detailsStore.configuration;
    if (!configuration) return;
    const nextMetadata: TRequirementMetadataDraft = {
      title: configuration.requirement.title,
      description_html: configuration.requirement.description_html,
    };
    const nextFields = configuration.fields.map(toDraftField);
    setMetadata(nextMetadata);
    setFields(nextFields);
    setBaseline(serializeDraft(nextMetadata, nextFields));
  }, [detailsStore.configuration]);

  const isDirty = useMemo(
    () => Boolean(metadata && baseline && serializeDraft(metadata, fields) !== baseline),
    [baseline, fields, metadata]
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleCancel = () => {
    if (isDirty && !window.confirm(t("workspace_templates.requirements.editor.discard_confirm"))) return;
    navigate(`/${workspaceSlug}/templates/requirements/${templateId}`);
  };

  const saveConfiguration = async (confirmDataLoss = false) => {
    if (!metadata || !detailsStore.configuration) return;
    if (!metadata.title.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_templates.requirements.validation.name_required"),
      });
      setActiveTab("basic");
      setIsPreviewOpen(false);
      return;
    }
    if (fields.some((field) => !field.name.trim() || field.children.some((child) => !child.name.trim()))) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_templates.requirements.validation.field_name"),
      });
      setActiveTab("fields");
      setIsPreviewOpen(false);
      return;
    }
    const allFields = fields.flatMap((field) => [field, ...field.children]);
    if (allFields.some((field) => field.field_type === "select" && !hasValidRequirementSelectOptions(field))) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_templates.requirements.validation.selector_options"),
      });
      setActiveTab("fields");
      setIsPreviewOpen(false);
      return;
    }

    try {
      const response = await detailsStore.updateConfiguration({
        expected_updated_at: detailsStore.configuration.requirement.updated_at,
        requirement: {
          ...metadata,
          title: metadata.title.trim(),
        },
        fields,
        confirm_data_loss: confirmDataLoss,
      });
      const nextMetadata: TRequirementMetadataDraft = {
        title: response.requirement.title,
        description_html: response.requirement.description_html,
      };
      const nextFields = response.fields.map(toDraftField);
      setMetadata(nextMetadata);
      setFields(nextFields);
      setBaseline(serializeDraft(nextMetadata, nextFields));
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_templates.requirements.toast.saved"),
      });
    } catch (error) {
      const payload = error as {
        code?: string;
        error?: string;
        affected_detail_count?: number;
        fields?: string[];
      };
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
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("workspace_templates.requirements.editor.conflict_title"),
          message: t("workspace_templates.requirements.editor.conflict_description"),
        });
        await detailsStore.fetchConfiguration().catch(() => undefined);
        return;
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("workspace_templates.requirements.toast.failed"),
      });
    }
  };

  const tabItems: Array<{ key: TEditorTab; label: string }> = [
    { key: "basic", label: t("workspace_templates.requirements.editor.tabs.basic") },
    { key: "fields", label: t("workspace_templates.requirements.editor.tabs.fields") },
  ];

  if (detailsStore.isConfigurationLoading || !metadata) {
    return (
      <div className="flex h-full flex-col bg-surface-1 p-6">
        <Loader>
          <Loader.Item height="44px" />
          <Loader.Item height="420px" />
        </Loader>
      </div>
    );
  }

  if (detailsStore.configurationError && !detailsStore.configuration) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-1 p-6 text-center">
        <div>
          <p className="text-13 font-medium text-primary">{t("workspace_templates.requirements.error.title")}</p>
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
    );
  }

  return (
    <>
      <PageHead title={`${t("workspace_templates.requirements.editor.title")} - ${metadata.title}`} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem className="min-w-0 gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="grid size-7 shrink-0 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                aria-label={t("back")}
              >
                <ArrowLeft className="size-4" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-13 font-medium text-primary">{metadata.title}</span>
                  {isDirty && (
                    <span className="shrink-0 rounded bg-warning-subtle px-1.5 py-0.5 text-10 text-warning-primary">
                      {t("workspace_templates.requirements.editor.unsaved")}
                    </span>
                  )}
                </div>
              </div>
            </Header.LeftItem>
            <Header.RightItem className="gap-2">
              <Button
                variant="secondary"
                onClick={() => setIsPreviewOpen((value) => !value)}
                aria-label={t(
                  isPreviewOpen
                    ? "workspace_templates.requirements.editor.close_preview"
                    : "workspace_templates.requirements.editor.preview"
                )}
              >
                <Eye className="size-3.5" />
                <span className="hidden md:inline">
                  {t(
                    isPreviewOpen
                      ? "workspace_templates.requirements.editor.close_preview"
                      : "workspace_templates.requirements.editor.preview"
                  )}
                </span>
              </Button>
              <Button variant="secondary" onClick={handleCancel} aria-label={t("cancel")}>
                <X className="size-3.5" />
                <span className="hidden md:inline">{t("cancel")}</span>
              </Button>
              <Button
                variant="primary"
                onClick={() => void saveConfiguration()}
                loading={detailsStore.isMutating}
                disabled={!isDirty}
              >
                <Save className="size-3.5" />
                <span className="hidden sm:inline">{t("save")}</span>
              </Button>
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        <nav className="flex h-12 shrink-0 items-end gap-1 overflow-x-auto border-b border-subtle bg-surface-1 px-4 md:px-6">
          {tabItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setActiveTab(item.key);
                setIsPreviewOpen(false);
              }}
              className={cn(
                "relative flex h-12 items-center gap-1.5 px-3 text-12 transition-colors duration-150",
                activeTab === item.key && !isPreviewOpen
                  ? "font-medium text-accent-primary after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:rounded-full after:bg-accent-primary"
                  : "text-secondary hover:text-primary"
              )}
            >
              {item.label}
              {item.key === "fields" && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-10",
                    activeTab === "fields" && !isPreviewOpen
                      ? "bg-accent-subtle text-accent-primary"
                      : "bg-layer-2 text-secondary"
                  )}
                >
                  {fields.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="flex min-h-0 flex-1 flex-col">
          {isPreviewOpen ? (
            <div className="min-h-0 flex-1 overflow-y-auto bg-layer-1/40">
              <section className="mx-auto max-w-6xl px-5 py-7 md:px-8">
                <div className="mb-5">
                  <h1 className="text-16 font-semibold text-primary">
                    {t("workspace_templates.requirements.preview.title")}
                  </h1>
                  <p className="mt-1 text-12 text-secondary">
                    {t("workspace_templates.requirements.preview.description")}
                  </p>
                </div>
                <RequirementFieldsPreview fields={fields} />
              </section>
            </div>
          ) : activeTab === "basic" ? (
            <div className="min-h-0 flex-1 overflow-y-auto bg-layer-1/40">
              <section className="mx-auto max-w-3xl px-5 py-7 md:px-8">
                <div className="mb-6">
                  <h1 className="text-16 font-semibold text-primary">
                    {t("workspace_templates.requirements.editor.tabs.basic")}
                  </h1>
                  <p className="mt-1 text-12 text-secondary">
                    {t("workspace_templates.requirements.editor.basic_description")}
                  </p>
                </div>
                <div className="space-y-5">
                  <label className="block">
                    <span className="mb-1.5 block text-12 font-medium text-secondary">
                      {t("workspace_templates.requirements.fields.name")}
                      <span className="ml-0.5 text-danger-primary">*</span>
                    </span>
                    <input
                      value={metadata.title}
                      onChange={(event) => setMetadata({ ...metadata, title: event.target.value })}
                      maxLength={255}
                      className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-12 font-medium text-secondary">
                      {t("workspace_templates.requirements.fields.description")}
                    </span>
                    <textarea
                      value={metadata.description_html ?? ""}
                      onChange={(event) => setMetadata({ ...metadata, description_html: event.target.value })}
                      rows={6}
                      className="focus:border-accent-primary w-full resize-y rounded-md border border-subtle bg-surface-1 px-3 py-2 text-12 leading-5 text-primary outline-none"
                      placeholder={t("workspace_templates.requirements.fields.description_placeholder")}
                    />
                  </label>
                </div>
              </section>
            </div>
          ) : (
            <RequirementFieldBuilder fields={fields} onChange={setFields} />
          )}
        </div>
      </ContentWrapper>
    </>
  );
});
