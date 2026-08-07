import { useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { ChevronDown, ListChecks, Save, Settings2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Tooltip } from "@plane/propel/tooltip";
import { Breadcrumbs, Header, Loader } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { PageHead } from "@/components/core/page-title";
import { RequirementFieldBuilder } from "@/components/requirements/requirement-field-builder";
import { RequirementTypeSettingsModal } from "@/components/requirements/requirement-type-settings-modal";
import { useRequirementTypeEditorState } from "@/components/requirements/use-requirement-type-editor-state";
import { SettingsFullBleedContentWrapper } from "@/components/settings/content-wrapper";
import { useRequirementTypes } from "@/hooks/store/use-requirement-types";
import { getSettingsRequirementTypePath } from "./navigation";

/**
 * 工作区设置里的需求类型二级页。
 *
 * 与模板管理下的 RequirementTypeEditor 共用同一个状态 hook（保存走乐观锁 +
 * 三种错误码，不能有两份实现），但各自渲染自己的外壳与导航。
 */
export const SettingsRequirementTypeEditor = observer(function SettingsRequirementTypeEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspaceSlug, requirementTypeId } = useParams();
  // 直接用 store hook，不碰模板管理的 context —— 那个 provider 以后要删
  const { requirementTypes, upsertRequirementType } = useRequirementTypes(workspaceSlug);
  const editor = useRequirementTypeEditorState({
    workspaceSlug,
    requirementTypeId,
    onRequirementTypeUpdate: upsertRequirementType,
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const listPath = getSettingsRequirementTypePath(workspaceSlug ?? "");
  const handleBack = () => {
    if (!editor.confirmDiscard()) return;
    navigate(listPath);
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
      <PageHead title={`${t("workspace_settings.settings.requirement_types.title")} - ${metadata.name}`} />
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
                        icon={<ListChecks className="size-4 text-secondary" />}
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
                            navigate(getSettingsRequirementTypePath(workspaceSlug ?? "", event.target.value));
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
                        /* 只做提示，不链到模板管理的标准库页 —— 那个页面以后会删 */
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
          <RequirementFieldBuilder fields={editor.fields} onChange={editor.setFields} />
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
