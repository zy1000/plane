import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { ChevronDown, FileText, Save, Settings2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementField, TRequirementFieldDraft, TRequirementType } from "@plane/types";
import { Tooltip } from "@plane/propel/tooltip";
import { Breadcrumbs, Header, Loader } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useRequirementLibraries } from "@/hooks/store/use-requirement-libraries";
import { useRequirementTypeDetails } from "@/hooks/store/use-requirement-type-details";
import { useRequirementTypesContext } from "./context";
import { RequirementFieldBuilder } from "./requirement-field-builder";
import { countRequirementColumns } from "@/components/requirements/requirement-fields-preview";
import { hasValidRequirementSelectOptions } from "@/components/requirements/requirement-select";
import { RequirementTypeSettingsModal } from "./requirement-type-settings-modal";
import { getRequirementTypePath } from "../navigation";

type TRequirementTypeMetadataDraft = Pick<TRequirementType, "name" | "description" | "is_active">;

const toDraftField = (field: TRequirementField): TRequirementFieldDraft => ({
  id: field.id,
  client_id: field.client_id,
  name: field.name,
  field_type: field.field_type,
  is_required: field.is_required,
  is_active: field.is_active,
  // 必须原样带回：后端把 builtin_key 的任何变化都当成「改内置标识」而拒绝
  builtin_key: field.builtin_key ?? null,
  config: { ...field.config },
  default_value: field.default_value,
  children: field.children.map(toDraftField),
});

const serializeDraft = (metadata: TRequirementTypeMetadataDraft, fields: TRequirementFieldDraft[]) =>
  JSON.stringify({ metadata, fields });

export const RequirementTypeEditor = observer(function RequirementTypeEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requirementTypeId } = useParams();
  const { workspaceSlug, requirementTypes, upsertRequirementType } = useRequirementTypesContext();
  const detailsStore = useRequirementTypeDetails({
    workspaceSlug,
    requirementTypeId,
    onRequirementTypeUpdate: upsertRequirementType,
  });
  const { libraries } = useRequirementLibraries(workspaceSlug);
  const [metadata, setMetadata] = useState<TRequirementTypeMetadataDraft | null>(null);
  const [fields, setFields] = useState<TRequirementFieldDraft[]>([]);
  const [baseline, setBaseline] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const configuration = detailsStore.configuration;
    if (!configuration) return;
    const nextMetadata: TRequirementTypeMetadataDraft = {
      name: configuration.requirement_type.name,
      description: configuration.requirement_type.description,
      is_active: configuration.requirement_type.is_active,
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

  const linkedLibraries = useMemo(
    () => libraries.filter((library) => library.requirement_type_id === requirementTypeId),
    [libraries, requirementTypeId]
  );

  // 用草稿算而不是用后端的 field_count，未保存的增删也要反映出来
  const fieldSummary = useMemo(
    () => ({ topLevel: fields.length, columns: countRequirementColumns(fields) }),
    [fields]
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  /** 页面本身就是编辑器，任何离开当前需求类型的导航都要先确认丢弃草稿 */
  const confirmDiscard = () =>
    !isDirty || window.confirm(t("workspace_templates.requirement_types.editor.discard_confirm"));

  const handleBack = () => {
    if (!confirmDiscard()) return;
    navigate(getRequirementTypePath(workspaceSlug));
  };

  const saveConfiguration = async (confirmDataLoss = false) => {
    if (!metadata || !detailsStore.configuration) return;
    if (!metadata.name.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_templates.requirement_types.validation.name_required"),
      });
      // 名称在「类型设置」弹窗里，直接打开让人改
      setIsSettingsOpen(true);
      return;
    }
    if (fields.some((field) => !field.name.trim() || field.children.some((child) => !child.name.trim()))) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("requirement_fields.validation.field_name"),
      });
      return;
    }
    const allFields = fields.flatMap((field) => [field, ...field.children]);
    if (allFields.some((field) => field.field_type === "select" && !hasValidRequirementSelectOptions(field))) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("requirement_fields.validation.selector_options"),
      });
      return;
    }

    try {
      const response = await detailsStore.updateConfiguration({
        expected_updated_at: detailsStore.configuration.requirement_type.updated_at,
        requirement_type: {
          ...metadata,
          name: metadata.name.trim(),
        },
        fields,
        confirm_data_loss: confirmDataLoss,
      });
      const nextMetadata: TRequirementTypeMetadataDraft = {
        name: response.requirement_type.name,
        description: response.requirement_type.description,
        is_active: response.requirement_type.is_active,
      };
      const nextFields = response.fields.map(toDraftField);
      setMetadata(nextMetadata);
      setFields(nextFields);
      setBaseline(serializeDraft(nextMetadata, nextFields));
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_templates.requirement_types.toast.saved"),
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
          t("workspace_templates.requirement_types.editor.data_loss_confirm", {
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
          title: t("workspace_templates.requirement_types.editor.conflict_title"),
          message: t("workspace_templates.requirement_types.editor.conflict_description"),
        });
        await detailsStore.fetchConfiguration().catch(() => undefined);
        return;
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("workspace_templates.requirement_types.toast.failed"),
      });
    }
  };

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
          <p className="text-13 font-medium text-primary">{t("workspace_templates.requirement_types.error.title")}</p>
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
      <PageHead title={`${t("workspace_templates.requirement_types.editor.title")} - ${metadata.name}`} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem className="min-w-0">
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    /* 不能用 href：离开编辑器前要先确认丢弃草稿 */
                    <button type="button" onClick={handleBack}>
                      <BreadcrumbLink
                        label={t("workspace_templates.requirement_types.title")}
                        icon={<FileText className="size-4 text-secondary" />}
                      />
                    </button>
                  }
                />
                <Breadcrumbs.Item
                  component={
                    <div className="flex min-w-0 items-center gap-2">
                      <label className="relative min-w-0">
                        <select
                          value={requirementTypeId ?? ""}
                          onChange={(event) => {
                            if (!event.target.value || event.target.value === requirementTypeId) return;
                            if (!confirmDiscard()) return;
                            navigate(getRequirementTypePath(workspaceSlug, event.target.value));
                          }}
                          className="h-7 max-w-72 appearance-none truncate rounded-md border border-transparent bg-transparent pr-7 pl-1 text-13 font-medium text-primary outline-none hover:border-subtle hover:bg-layer-transparent-hover"
                          aria-label={t("workspace_templates.requirement_types.switch_requirement_type")}
                        >
                          {requirementTypes.map((item) => (
                            <option key={item.id} value={item.id}>
                              {/* 当前项用草稿名称，否则在设置里改名未保存时下拉显示的还是旧名 */}
                              {item.id === requirementTypeId ? metadata.name : item.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-secondary" />
                      </label>
                      {isDirty && (
                        <span className="shrink-0 rounded bg-warning-subtle px-1.5 py-0.5 text-10 text-warning-primary">
                          {t("workspace_templates.requirement_types.editor.unsaved")}
                        </span>
                      )}
                      {linkedLibraries.length > 0 && (
                        <Tooltip
                          tooltipContent={t("workspace_templates.requirement_types.editor.used_by_hint")}
                          position="bottom"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              // 离开当前需求类型，先确认丢弃草稿
                              if (!confirmDiscard()) return;
                              navigate(`/${workspaceSlug}/templates/libraries?requirement_type=${requirementTypeId}`);
                            }}
                            className="text-accent-primary hover:bg-accent-subtle shrink-0 rounded border border-accent-primary/25 bg-accent-primary/[0.06] px-1.5 py-0.5 text-10 transition-colors"
                          >
                            {t("workspace_templates.requirement_types.editor.used_by_count", {
                              count: linkedLibraries.length,
                            })}
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem className="gap-2">
              <Button
                variant="secondary"
                onClick={() => setIsSettingsOpen(true)}
                aria-label={t("workspace_templates.requirement_types.editor.settings")}
              >
                <Settings2 className="size-3.5" />
                <span className="hidden md:inline">{t("workspace_templates.requirement_types.editor.settings")}</span>
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
        <div className="flex min-h-0 flex-1 flex-col">
          <RequirementFieldBuilder fields={fields} onChange={setFields} />
        </div>
      </ContentWrapper>
      <RequirementTypeSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        metadata={metadata}
        onApply={setMetadata}
        requirementType={detailsStore.configuration?.requirement_type}
        fieldSummary={fieldSummary}
      />
    </>
  );
});
