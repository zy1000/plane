import { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Pencil, Workflow } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TDevModeFeatureKey, TDevModeStage } from "@plane/types";
import { AlertModalCore, Breadcrumbs, Header, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { toTypeIconProps, TypeIcon } from "@/components/common/type-icon-picker";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useDevModeDetail } from "@/hooks/store/use-dev-mode-detail";
import { useStageReviewTemplates } from "@/hooks/store/use-stage-review-templates";
import { useStageTypes } from "@/hooks/store/use-stage-types";
import { useTemplatePermissions } from "../permissions";
import { DevModeFeatureToggles } from "./dev-mode-feature-toggles";
import { DevModeFormModal, type TDevModeFormValue } from "./dev-mode-form-modal";
import { DevModeStageBulkCreateModal } from "./dev-mode-stage-bulk-create-modal";
import { DevModeStageFormModal, type TDevModeStageFormValue } from "./dev-mode-stage-form-modal";
import { DevModeStageTable } from "./dev-mode-stage-table";
import { DevModeStageTemplatesPanel } from "./dev-mode-stage-templates-panel";
import { DEV_MODE_I18N } from "./dev-modes-grid";

type TStageEditor = { mode: "closed" } | { mode: "create" } | { mode: "edit"; stage: TDevModeStage };
type TPendingDelete = { stage: TDevModeStage } | { bulk: string[] } | null;

const toNullableString = (value: string) => (value.trim() === "" ? null : value.trim());
const toNullableNumber = (value: string) => (value.trim() === "" ? null : Number(value));

/**
 * 模式详情页：头部（图标 / 名称 / 描述）→ 组件开关条（直接切即保存）→ 阶段表 + 勾选面板。
 *
 * 阶段类型清单来自工作区的阶段类型库（新建阶段要从里面选）；每个类型下的节点数用评审
 * 模板列表算，只为了在批量新建弹窗里提示「会勾上多少个」。
 */
export const DevModeDetailRoot = observer(function DevModeDetailRoot({
  workspaceSlug,
  devModeId,
}: {
  workspaceSlug: string;
  devModeId: string;
}) {
  const { t } = useTranslation();
  const { canManageDevModes } = useTemplatePermissions(workspaceSlug);
  const { stageTypes, stageOptions } = useStageTypes(workspaceSlug);
  const { templates } = useStageReviewTemplates(workspaceSlug, stageOptions);

  const detail = useDevModeDetail(workspaceSlug, devModeId);
  const {
    devMode,
    stages,
    isLoading,
    isMutating,
    error,
    workloadTotal,
    workloadRemaining,
    fetchDevMode,
    updateDevMode,
    createStage,
    bulkCreateStages,
    updateStage,
    deleteStage,
    bulkDeleteStages,
    reorderStages,
    activeStage,
    activeStageId,
    openStage,
    templateTree,
    draftSelection,
    toggleTemplate,
    resetTemplateDraft,
    saveTemplateDraft,
    hasTemplateChanges,
    isTemplatesLoading,
    isSavingTemplates,
  } = detail;

  const [isEditingMode, setIsEditingMode] = useState(false);
  const [stageEditor, setStageEditor] = useState<TStageEditor>({ mode: "closed" });
  const [isBulkCreateOpen, setIsBulkCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<TPendingDelete>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /** 每个阶段类型下的活跃评审节点数，批量新建弹窗用 */
  const templateCountByStageType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const template of templates) {
      if (!template.is_active) continue;
      counts[template.stage_id] = (counts[template.stage_id] ?? 0) + 1;
    }
    return counts;
  }, [templates]);

  const handleFeatureChange = useCallback(
    (key: TDevModeFeatureKey, next: boolean) => {
      if (!devMode) return;
      void updateDevMode({ features: { ...devMode.features, [key]: next } })
        .then(() => setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.features_updated`) }))
        .catch(() => setToast({ type: TOAST_TYPE.ERROR, title: t(`${DEV_MODE_I18N}.errors.generic`) }));
    },
    [devMode, t, updateDevMode]
  );

  const handleModeSubmit = useCallback(
    async (value: TDevModeFormValue) => {
      if (!devMode) return;
      const payload = {
        description: value.description,
        icon_props: { in_use: "icon" as const, icon: toTypeIconProps(value.icon) },
        features: value.features,
      };
      await updateDevMode(devMode.is_system ? payload : { ...payload, name: value.name });
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.updated`) });
      setIsEditingMode(false);
    },
    [devMode, t, updateDevMode]
  );

  const handleStageSubmit = useCallback(
    async (value: TDevModeStageFormValue) => {
      const payload = {
        name: value.name,
        workload_ratio: toNullableString(value.workloadRatio),
        standard_days: toNullableNumber(value.standardDays),
      };
      if (stageEditor.mode === "edit") {
        await updateStage(stageEditor.stage.id, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.stage_updated`) });
      } else {
        await createStage({ ...payload, stage_type_id: value.stageTypeId });
        setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.stage_created`) });
      }
      setStageEditor({ mode: "closed" });
    },
    [createStage, stageEditor, t, updateStage]
  );

  const handleBulkCreate = useCallback(
    async (stageTypeIds: string[]) => {
      const result = await bulkCreateStages(stageTypeIds);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t(`${DEV_MODE_I18N}.toast.stages_created`, {
          created: result?.created ?? 0,
          skipped: result?.skipped ?? 0,
        }),
      });
      setIsBulkCreateOpen(false);
    },
    [bulkCreateStages, t]
  );

  const handleDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      if ("bulk" in pendingDelete) {
        await bulkDeleteStages(pendingDelete.bulk);
        setSelectedIds(new Set());
      } else {
        await deleteStage(pendingDelete.stage.id);
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(pendingDelete.stage.id);
          return next;
        });
      }
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.stage_deleted`) });
      setPendingDelete(null);
    } catch (deleteError) {
      const payload = deleteError as { code?: string; error?: string; stages?: string[] } | undefined;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(`${DEV_MODE_I18N}.toast.stage_delete_failed`),
        message:
          payload?.code === "DEV_MODE_STAGE_IN_USE"
            ? t(`${DEV_MODE_I18N}.errors.dev_mode_stage_in_use`, {
                names: (payload.stages ?? []).join("、"),
              })
            : (payload?.error ?? t(`${DEV_MODE_I18N}.errors.generic`)),
      });
    } finally {
      setIsDeleting(false);
    }
  }, [bulkDeleteStages, deleteStage, pendingDelete, t]);

  const handleReorder = useCallback(
    (ordered: TDevModeStage[]) => {
      void reorderStages(ordered.map((item) => item.id)).catch(() => {
        setToast({ type: TOAST_TYPE.ERROR, title: t(`${DEV_MODE_I18N}.toast.reorder_failed`) });
      });
    },
    [reorderStages, t]
  );

  const handleOpenStage = useCallback(
    (stage: TDevModeStage) => {
      // 再点一次已展开的行就收起面板
      void openStage(activeStageId === stage.id ? null : stage.id).catch(() => {
        setToast({ type: TOAST_TYPE.ERROR, title: t(`${DEV_MODE_I18N}.errors.templates_load_failed`) });
      });
    },
    [activeStageId, openStage, t]
  );

  const handleSaveTemplates = useCallback(() => {
    void saveTemplateDraft()
      .then(() => setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.templates_saved`) }))
      .catch((saveError) => {
        const payload = saveError as { code?: string; error?: string } | undefined;
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t(`${DEV_MODE_I18N}.errors.generic`),
          message: payload?.error,
        });
      });
  }, [saveTemplateDraft, t]);

  /** 编辑某行时，「已分配」要把这一行自己排除掉，否则改成原值也会被判超限 */
  const allocatedExcludingCurrent = useMemo(() => {
    if (stageEditor.mode !== "edit") return workloadTotal;
    return workloadTotal - Number(stageEditor.stage.workload_ratio ?? 0);
  }, [stageEditor, workloadTotal]);

  if (isLoading) {
    return (
      <ContentWrapper className="flex min-h-0 flex-col gap-4 overflow-hidden bg-surface-1 p-5">
        <Loader className="flex flex-col gap-4">
          <Loader.Item height="56px" />
          <Loader.Item height="52px" />
          <Loader.Item height="360px" />
        </Loader>
      </ContentWrapper>
    );
  }

  if (error || !devMode) {
    return (
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1 p-5">
        <div className="rounded-lg border border-subtle p-10 text-center">
          <p className="text-13 font-medium text-primary">{t(`${DEV_MODE_I18N}.error_title`)}</p>
          {error && <p className="mt-1 text-12 text-secondary">{error}</p>}
          {/* fetchDevMode 失败时会 setError 后 rethrow，裸 void 会留下 unhandled rejection */}
          <Button className="mt-4" variant="secondary" size="lg" onClick={() => void fetchDevMode().catch(() => undefined)}>
            {t("retry")}
          </Button>
        </div>
      </ContentWrapper>
    );
  }

  return (
    <>
      <PageHead title={devMode.name} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      href={`/${workspaceSlug}/templates/dev-modes`}
                      label={t(`${DEV_MODE_I18N}.title`)}
                      icon={<Workflow className="size-4 text-secondary" />}
                    />
                  }
                />
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={devMode.name}
                      icon={<TypeIcon iconProps={devMode.icon_props?.icon} className="size-4" iconClassName="size-3" />}
                      isLast
                    />
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            {canManageDevModes && (
              <Header.RightItem className="gap-2">
                <Button variant="secondary" onClick={() => setIsEditingMode(true)}>
                  <Pencil className="size-3.5" />
                  {t(`${DEV_MODE_I18N}.detail.edit_mode`)}
                </Button>
              </Header.RightItem>
            )}
          </Header>
        }
      />

      <ContentWrapper className="flex min-h-0 flex-col gap-4 overflow-hidden bg-surface-1 p-5">
        <div className="flex items-start gap-3.5">
          <TypeIcon iconProps={devMode.icon_props?.icon} className="size-12 rounded-[11px]" iconClassName="size-6" />
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-18 font-semibold text-primary">
              {devMode.name}
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded px-2 text-11 font-medium",
                  devMode.is_system
                    ? "border border-subtle bg-surface-2 text-secondary"
                    : "border border-accent-primary/30 bg-accent-primary/10 text-accent-primary"
                )}
              >
                {t(devMode.is_system ? `${DEV_MODE_I18N}.card.preset` : `${DEV_MODE_I18N}.card.custom`)}
              </span>
            </h1>
            <p className="mt-1 max-w-3xl text-12 leading-5 text-secondary">
              {devMode.description || t(`${DEV_MODE_I18N}.card.no_description`)}
              {devMode.is_system && ` ${t(`${DEV_MODE_I18N}.detail.preset_hint`)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-lg border border-subtle bg-surface-1 px-4 py-3">
          <span className="flex shrink-0 flex-col gap-0.5">
            <b className="text-13 font-medium text-primary">{t(`${DEV_MODE_I18N}.detail.features_title`)}</b>
            <span className="text-11 text-tertiary">{t(`${DEV_MODE_I18N}.detail.features_hint`)}</span>
          </span>
          <DevModeFeatureToggles
            features={devMode.features}
            disabled={!canManageDevModes || isMutating}
            onChange={handleFeatureChange}
          />
        </div>

        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <DevModeStageTable
              stages={stages}
              activeStageId={activeStageId}
              selectedIds={selectedIds}
              canEdit={canManageDevModes}
              workloadTotal={workloadTotal}
              workloadRemaining={workloadRemaining}
              onOpenStage={handleOpenStage}
              onToggleSelect={(stageId, checked) =>
                setSelectedIds((current) => {
                  const next = new Set(current);
                  if (checked) next.add(stageId);
                  else next.delete(stageId);
                  return next;
                })
              }
              onToggleSelectAll={(checked) =>
                setSelectedIds(checked ? new Set(stages.map((item) => item.id)) : new Set())
              }
              onEditStage={(stage) => setStageEditor({ mode: "edit", stage })}
              onDeleteStage={(stage) => setPendingDelete({ stage })}
              onBulkDelete={() => setPendingDelete({ bulk: [...selectedIds] })}
              onReorder={handleReorder}
              onCreate={() => setStageEditor({ mode: "create" })}
              onBulkCreate={() => setIsBulkCreateOpen(true)}
            />
          </div>

          {activeStage && (
            <DevModeStageTemplatesPanel
              stage={activeStage}
              tree={templateTree}
              draftSelection={draftSelection}
              hasChanges={hasTemplateChanges}
              isLoading={isTemplatesLoading}
              isSaving={isSavingTemplates}
              canEdit={canManageDevModes}
              onClose={() => void openStage(null)}
              onToggle={toggleTemplate}
              onReset={resetTemplateDraft}
              onSave={handleSaveTemplates}
            />
          )}
        </div>
      </ContentWrapper>

      <DevModeFormModal
        isOpen={isEditingMode}
        devMode={devMode}
        isSubmitting={isMutating}
        onClose={() => setIsEditingMode(false)}
        onSubmit={handleModeSubmit}
      />

      <DevModeStageFormModal
        isOpen={stageEditor.mode !== "closed"}
        stage={stageEditor.mode === "edit" ? stageEditor.stage : null}
        stageTypes={stageTypes}
        allocatedExcludingCurrent={allocatedExcludingCurrent}
        isSubmitting={isMutating}
        onClose={() => setStageEditor({ mode: "closed" })}
        onSubmit={handleStageSubmit}
      />

      <DevModeStageBulkCreateModal
        isOpen={isBulkCreateOpen}
        stageTypes={stageTypes}
        stages={stages}
        templateCountByStageType={templateCountByStageType}
        isSubmitting={isMutating}
        onClose={() => setIsBulkCreateOpen(false)}
        onSubmit={handleBulkCreate}
      />

      <AlertModalCore
        isOpen={Boolean(pendingDelete)}
        variant="danger"
        isSubmitting={isDeleting}
        handleClose={() => setPendingDelete(null)}
        handleSubmit={() => void handleDelete()}
        title={
          pendingDelete && "bulk" in pendingDelete
            ? t(`${DEV_MODE_I18N}.delete_stage_modal.bulk_title`, { count: pendingDelete.bulk.length })
            : t(`${DEV_MODE_I18N}.delete_stage_modal.title`, { name: pendingDelete?.stage.name ?? "" })
        }
        content={t(`${DEV_MODE_I18N}.delete_stage_modal.description`)}
        primaryButtonText={{
          default: t(`${DEV_MODE_I18N}.delete_stage_modal.confirm`),
          loading: t(`${DEV_MODE_I18N}.delete_stage_modal.deleting`),
        }}
        secondaryButtonText={t("cancel")}
      />
    </>
  );
});
