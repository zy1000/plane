import { useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { ChevronDown, Save, Settings2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { RequirementIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirementFieldDraft } from "@plane/types";
import { Breadcrumbs, Header, Loader } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { PageHead } from "@/components/core/page-title";
import { RequirementFieldBuilder } from "@/components/requirements/requirement-field-builder";
import { RequirementTypeSettingsModal } from "@/components/requirements/requirement-type-settings-modal";
import { useRequirementTypeEditorState } from "@/components/requirements/use-requirement-type-editor-state";
import { SettingsFullBleedContentWrapper } from "@/components/settings/content-wrapper";
import { useRequirementFieldLibrary } from "@/hooks/store/use-requirement-field-library";
import { useRequirementTypes } from "@/hooks/store/use-requirement-types";
import { getRequirementFieldLibraryPath, getRequirementTypePath } from "./navigation";

/**
 * 模板中心「需求类型」下某个类型的字段配置页。
 *
 * 草稿、脏检查与带乐观锁的保存都在 useRequirementTypeEditorState 里，这里只管外壳、导航，
 * 以及把需求通用字段库接给字段构建器（左栏的通用字段列表、转为通用字段、去字段库）。
 * 外壳沿用 SettingsFullBleedContentWrapper：它只是「页头 + 撑满的内容区」，与设置页无关。
 */
export const RequirementTypeEditor = observer(function RequirementTypeEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspaceSlug, requirementTypeId } = useParams();
  const { requirementTypes, upsertRequirementType } = useRequirementTypes(workspaceSlug);
  const editor = useRequirementTypeEditorState({
    workspaceSlug,
    requirementTypeId,
    onRequirementTypeUpdate: upsertRequirementType,
  });
  const library = useRequirementFieldLibrary(workspaceSlug);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const listPath = getRequirementTypePath(workspaceSlug ?? "");
  const handleBack = () => {
    if (!editor.confirmDiscard()) return;
    navigate(listPath);
  };

  /** 去字段库也是离开编辑器，先确认丢弃草稿 */
  const handleOpenLibrary = (definitionId?: string) => {
    if (!editor.confirmDiscard()) return;
    navigate(getRequirementFieldLibraryPath(workspaceSlug ?? "", definitionId));
  };

  /**
   * 转为通用字段是立即生效的独立请求（原地绑定，字段 id 与已有值不变），不走草稿。
   * 有未保存的改动时先让用户保存：转换后要重新拉配置，草稿会被冲掉。
   */
  const handlePromote = async (field: TRequirementFieldDraft) => {
    if (!field.id || !requirementTypeId) return;
    if (editor.isDirty) {
      setToast({ type: TOAST_TYPE.ERROR, title: "请先保存当前修改", message: "保存字段结构后再转为通用字段。" });
      return;
    }
    if (
      !window.confirm(
        `将「${field.name}」转为通用字段？转换后字段定义由需求通用字段库统一维护，本类型内不能再修改；已有的字段值不受影响。`
      )
    )
      return;
    try {
      await library.promoteField(requirementTypeId, field.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已转为通用字段" });
      await editor.reload();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "转换失败",
        message: (error as { error?: string })?.error ?? "无法转为通用字段，请稍后重试。",
      });
    }
  };

  const { metadata } = editor;
  const libraryCount = editor.requirementType?.library_count ?? 0;

  if (editor.isLoading || !metadata) {
    return (
      <SettingsFullBleedContentWrapper>
        <div className="flex h-full flex-col bg-surface-1 p-6">
          <Loader>
            <Loader.Item height="44px" />
            <Loader.Item height="420px" />
          </Loader>
        </div>
      </SettingsFullBleedContentWrapper>
    );
  }

  if (editor.error && !editor.configuration) {
    return (
      <SettingsFullBleedContentWrapper>
        <div className="flex h-full items-center justify-center bg-surface-1 p-6 text-center">
          <div>
            <p className="text-13 font-medium text-primary">{t("workspace_templates.requirement_types.error.title")}</p>
            <p className="mt-1 text-12 text-secondary">{editor.error}</p>
            <Button className="mt-3" variant="secondary" onClick={() => void editor.reload()}>
              {t("retry")}
            </Button>
          </div>
        </div>
      </SettingsFullBleedContentWrapper>
    );
  }

  return (
    <>
      <PageHead title={`${metadata.name} - ${t("workspace_settings.settings.requirement_types.title")}`} />
      <SettingsFullBleedContentWrapper
        header={
          <Header>
            <Header.LeftItem className="min-w-0">
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    /* 不能用 Link：离开编辑器前要先确认丢弃草稿 */
                    <button type="button" onClick={handleBack}>
                      <BreadcrumbLink
                        label={t("workspace_settings.settings.requirement_types.title")}
                        icon={<RequirementIcon className="size-4 text-secondary" />}
                      />
                    </button>
                  }
                />
                <Breadcrumbs.Item
                  component={
                    <div className="flex min-w-0 items-center gap-2">
                      {/* 当前类型的图标：改了设置弹窗里的图标后，这里立刻反映草稿值 */}
                      <TypeIcon
                        iconProps={metadata.logo_props?.icon}
                        className="size-5 rounded"
                        iconClassName="size-3.5"
                      />
                      <label className="relative min-w-0">
                        <select
                          value={requirementTypeId ?? ""}
                          onChange={(event) => {
                            if (!event.target.value || event.target.value === requirementTypeId) return;
                            if (!editor.confirmDiscard()) return;
                            navigate(getRequirementTypePath(workspaceSlug ?? "", event.target.value));
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
                      {editor.isDirty && (
                        <span className="shrink-0 rounded bg-warning-subtle px-1.5 py-0.5 text-10 text-warning-primary">
                          {t("workspace_templates.requirement_types.editor.unsaved")}
                        </span>
                      )}
                      {libraryCount > 0 && (
                        /* 只做提示，不链到标准需求库页 */
                        <Tooltip
                          tooltipContent={t("workspace_templates.requirement_types.editor.used_by_hint")}
                          position="bottom"
                        >
                          <span className="text-accent-primary shrink-0 rounded border border-accent-primary/25 bg-accent-primary/[0.06] px-1.5 py-0.5 text-10">
                            {t("workspace_templates.requirement_types.editor.used_by_count", {
                              count: libraryCount,
                            })}
                          </span>
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
                onClick={() => void editor.save({ onNameInvalid: () => setIsSettingsOpen(true) })}
                loading={editor.isSaving}
                disabled={!editor.isDirty}
              >
                <Save className="size-3.5" />
                <span className="hidden sm:inline">{t("save")}</span>
              </Button>
            </Header.RightItem>
          </Header>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
          <RequirementFieldBuilder
            items={editor.items}
            onChange={editor.setItems}
            fieldValueCounts={editor.configuration?.field_value_counts ?? {}}
            commonFields={{
              definitions: library.fields,
              isLoading: library.isLoading && !library.hasLoaded,
              onOpenLibrary: handleOpenLibrary,
              onPromote: (field) => void handlePromote(field),
            }}
          />
        </div>
      </SettingsFullBleedContentWrapper>
      <RequirementTypeSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        metadata={metadata}
        onApply={editor.setMetadata}
        requirementType={editor.requirementType}
        fieldSummary={editor.fieldSummary}
      />
    </>
  );
});
