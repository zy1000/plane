import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TRequirementField,
  TRequirementFieldDraft,
  TRequirementType,
  TRequirementTypeConfiguration,
} from "@plane/types";
import { useRequirementTypeDetails } from "@/hooks/store/use-requirement-type-details";
import { countRequirementColumns } from "./requirement-fields-preview";
import { hasValidRequirementSelectOptions } from "./requirement-select";

export type TRequirementTypeMetadataDraft = Pick<
  TRequirementType,
  "name" | "description" | "is_active" | "logo_props"
>;

const toDraftField = (field: TRequirementField): TRequirementFieldDraft => ({
  id: field.id,
  client_id: field.client_id,
  name: field.name,
  field_type: field.field_type,
  is_required: field.is_required,
  is_active: field.is_active,
  field_category: field.field_category,
  config: { ...field.config },
  default_value: field.default_value,
  children: field.children.map(toDraftField),
});

const serializeDraft = (metadata: TRequirementTypeMetadataDraft, fields: TRequirementFieldDraft[]) =>
  JSON.stringify({ metadata, fields });

type TArgs = {
  workspaceSlug: string | undefined;
  requirementTypeId: string | undefined;
  /**
   * 引用必须稳定 —— 它会进 useRequirementTypeDetails.fetchConfiguration 的
   * useCallback 依赖，而后者本身又是一个 useEffect 的依赖。传内联箭头会对
   * /configuration/ 打出无上限的 GET 循环。
   */
  onRequirementTypeUpdate?: (requirementType: TRequirementType) => void;
};

type TSaveOptions = {
  confirmDataLoss?: boolean;
  /** 名称为空时的回调 —— 让调用方去打开自己的设置弹窗，hook 不持有弹窗状态 */
  onNameInvalid?: () => void;
};

export type TRequirementTypeEditorState = {
  configuration: TRequirementTypeConfiguration | null;
  requirementType: TRequirementType | undefined;
  metadata: TRequirementTypeMetadataDraft | null;
  setMetadata: (next: TRequirementTypeMetadataDraft) => void;
  fields: TRequirementFieldDraft[];
  setFields: (next: TRequirementFieldDraft[]) => void;
  isDirty: boolean;
  fieldSummary: { topLevel: number; columns: number };
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  save: (options?: TSaveOptions) => Promise<boolean>;
  reload: () => Promise<void>;
  confirmDiscard: () => boolean;
};

/**
 * 需求类型编辑器的状态内核：草稿、脏检查、校验与带乐观锁的保存。
 *
 * 由「模板管理」与「工作区设置」两个壳共用 —— 保存路径涉及乐观锁与三种错误码，
 * 两份拷贝迟早会静默分叉，所以壳可以各写各的，这块必须共享。
 */
export const useRequirementTypeEditorState = ({
  workspaceSlug,
  requirementTypeId,
  onRequirementTypeUpdate,
}: TArgs): TRequirementTypeEditorState => {
  const { t } = useTranslation();
  const detailsStore = useRequirementTypeDetails({
    workspaceSlug,
    requirementTypeId,
    onRequirementTypeUpdate,
  });
  const [metadata, setMetadata] = useState<TRequirementTypeMetadataDraft | null>(null);
  const [fields, setFields] = useState<TRequirementFieldDraft[]>([]);
  const [baseline, setBaseline] = useState("");

  useEffect(() => {
    const configuration = detailsStore.configuration;
    if (!configuration) return;
    const nextMetadata: TRequirementTypeMetadataDraft = {
      name: configuration.requirement_type.name,
      description: configuration.requirement_type.description,
      is_active: configuration.requirement_type.is_active,
      logo_props: configuration.requirement_type.logo_props ?? {},
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
  const confirmDiscard = useCallback(
    () => !isDirty || window.confirm(t("workspace_templates.requirement_types.editor.discard_confirm")),
    [isDirty, t]
  );

  const reload = useCallback(async () => {
    await detailsStore.fetchConfiguration().catch(() => undefined);
  }, [detailsStore]);

  const save = useCallback(
    async (options: TSaveOptions = {}): Promise<boolean> => {
      const { confirmDataLoss = false, onNameInvalid } = options;
      if (!metadata || !detailsStore.configuration) return false;
      if (!metadata.name.trim()) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: t("workspace_templates.requirement_types.validation.name_required"),
        });
        // 名称在「类型设置」弹窗里，让调用方把它打开
        onNameInvalid?.();
        return false;
      }
      if (fields.some((field) => !field.name.trim() || field.children.some((child) => !child.name.trim()))) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: t("requirement_fields.validation.field_name"),
        });
        return false;
      }
      // 分类没有默认值，未选就保存会被后端拒掉，在这里先拦一次给出可读的提示
      if (fields.some((field) => !field.field_category)) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: t("requirement_fields.field_categories.required"),
        });
        return false;
      }
      const allFields = fields.flatMap((field) => [field, ...field.children]);
      if (allFields.some((field) => field.field_type === "select" && !hasValidRequirementSelectOptions(field))) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: t("requirement_fields.validation.selector_options"),
        });
        return false;
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
          logo_props: response.requirement_type.logo_props ?? {},
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
        return true;
      } catch (error) {
        const payload = error as {
          code?: string;
          error?: string;
          affected_requirement_count?: number;
          fields?: string[];
        };
        if (
          payload?.code === "REQUIREMENT_SCHEMA_DATA_LOSS" &&
          !confirmDataLoss &&
          window.confirm(
            t("workspace_templates.requirement_types.editor.data_loss_confirm", {
              count: payload.affected_requirement_count ?? 0,
            })
          )
        ) {
          return save({ confirmDataLoss: true, onNameInvalid });
        }
        if (payload?.code === "REQUIREMENT_CONFIGURATION_CONFLICT") {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("workspace_templates.requirement_types.editor.conflict_title"),
            message: t("workspace_templates.requirement_types.editor.conflict_description"),
          });
          await detailsStore.fetchConfiguration().catch(() => undefined);
          return false;
        }
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: payload?.error ?? t("workspace_templates.requirement_types.toast.failed"),
        });
        return false;
      }
    },
    [detailsStore, fields, metadata, t]
  );

  return {
    configuration: detailsStore.configuration,
    requirementType: detailsStore.configuration?.requirement_type,
    metadata,
    setMetadata,
    fields,
    setFields,
    isDirty,
    fieldSummary,
    isLoading: detailsStore.isConfigurationLoading || !metadata,
    isSaving: detailsStore.isMutating,
    error: detailsStore.configurationError,
    save,
    reload,
    confirmDiscard,
  };
};
