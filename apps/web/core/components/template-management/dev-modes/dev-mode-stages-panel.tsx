import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TDevModeStage } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { useStageReviewTemplates } from "@/hooks/store/use-stage-review-templates";
import { useStageTypes } from "@/hooks/store/use-stage-types";
import { useTemplatePermissions } from "../permissions";
import { useDevModeDetailContext } from "./context";
import { DevModeStageBulkCreateModal } from "./dev-mode-stage-bulk-create-modal";
import { DevModeStageFormModal, type TDevModeStageFormValue } from "./dev-mode-stage-form-modal";
import { DevModeStageTable } from "./dev-mode-stage-table";
import { DevModeStageTemplatesPanel } from "./dev-mode-stage-templates-panel";
import { DEV_MODE_I18N } from "./dev-modes-grid";

type TStageEditor = { mode: "closed" } | { mode: "create" } | { mode: "edit"; stage: TDevModeStage };

const toNullableString = (value: string) => (value.trim() === "" ? null : value.trim());
const toNullableNumber = (value: string) => (value.trim() === "" ? null : Number(value));

/**
 * 「阶段与评审」（方案 A）：左边阶段表，右边常驻所选阶段的评审节点勾选。
 *
 * 总有一个阶段是选中的（进页默认第一个），右栏不再点了才弹出。阶段类型清单来自工作区的
 * 阶段类型库；每个类型下的节点数用评审模板列表算，表格的「已勾 / 可勾」和批量新建弹窗都用它。
 */
export const DevModeStagesPanel = observer(function DevModeStagesPanel() {
  const { t } = useTranslation();
  const {
    workspaceSlug,
    stages,
    isMutating,
    workloadTotal,
    workloadRemaining,
    createStage,
    bulkCreateStages,
    updateStage,
    deleteStage,
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
  } = useDevModeDetailContext();
  const { canManageDevModes } = useTemplatePermissions(workspaceSlug);
  const { stageTypes, stageOptions } = useStageTypes(workspaceSlug);
  const { templates } = useStageReviewTemplates(workspaceSlug, stageOptions);

  const [stageEditor, setStageEditor] = useState<TStageEditor>({ mode: "closed" });
  const [isBulkCreateOpen, setIsBulkCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TDevModeStage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /** 每个阶段类型下的活跃评审节点数 */
  const templateCountByStageType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const template of templates) {
      if (!template.is_active) continue;
      counts[template.stage_id] = (counts[template.stage_id] ?? 0) + 1;
    }
    return counts;
  }, [templates]);

  const handleOpenStage = useCallback(
    (stageId: string) => {
      void openStage(stageId).catch(() => {
        setToast({ type: TOAST_TYPE.ERROR, title: t(`${DEV_MODE_I18N}.errors.templates_load_failed`) });
      });
    },
    [openStage, t]
  );

  // 进页面默认选第一个阶段；选中的被删了落回第一个
  useEffect(() => {
    if (stages.length === 0) return;
    if (activeStageId && stages.some((stage) => stage.id === activeStageId)) return;
    handleOpenStage(stages[0].id);
  }, [stages, activeStageId, handleOpenStage]);

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
        const created = await createStage({ ...payload, stage_type_id: value.stageTypeId });
        setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.stage_created`) });
        if (created) handleOpenStage(created.id);
      }
      setStageEditor({ mode: "closed" });
    },
    [createStage, handleOpenStage, stageEditor, t, updateStage]
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
      await deleteStage(pendingDelete.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.stage_deleted`) });
      setPendingDelete(null);
    } catch (deleteError) {
      const payload = deleteError as { error?: string } | undefined;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(`${DEV_MODE_I18N}.toast.stage_delete_failed`),
        message: payload?.error ?? t(`${DEV_MODE_I18N}.errors.generic`),
      });
    } finally {
      setIsDeleting(false);
    }
  }, [deleteStage, pendingDelete, t]);

  const handleReorder = useCallback(
    (ordered: TDevModeStage[]) => {
      void reorderStages(ordered.map((item) => item.id)).catch(() => {
        setToast({ type: TOAST_TYPE.ERROR, title: t(`${DEV_MODE_I18N}.toast.reorder_failed`) });
      });
    },
    [reorderStages, t]
  );

  const handleSaveTemplates = useCallback(() => {
    void saveTemplateDraft()
      .then(() => setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.templates_saved`) }))
      .catch((saveError) => {
        const payload = saveError as { error?: string } | undefined;
        setToast({ type: TOAST_TYPE.ERROR, title: t(`${DEV_MODE_I18N}.errors.generic`), message: payload?.error });
      });
  }, [saveTemplateDraft, t]);

  /** 编辑某行时，「已分配」要把这一行自己排除掉，否则改成原值也会被判超限 */
  const allocatedExcludingCurrent = useMemo(() => {
    if (stageEditor.mode !== "edit") return workloadTotal;
    return workloadTotal - Number(stageEditor.stage.workload_ratio ?? 0);
  }, [stageEditor, workloadTotal]);

  return (
    <>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 pb-5 pl-7 pr-6 pt-[18px]">
          <DevModeStageTable
            stages={stages}
            activeStageId={activeStageId}
            totalByStageType={templateCountByStageType}
            canEdit={canManageDevModes}
            workloadTotal={workloadTotal}
            workloadRemaining={workloadRemaining}
            onOpenStage={(stage) => {
              if (stage.id !== activeStageId) handleOpenStage(stage.id);
            }}
            onEditStage={(stage) => setStageEditor({ mode: "edit", stage })}
            onDeleteStage={setPendingDelete}
            onReorder={handleReorder}
            onCreate={() => setStageEditor({ mode: "create" })}
            onBulkCreate={() => setIsBulkCreateOpen(true)}
          />
        </div>

        {activeStage && (
          <DevModeStageTemplatesPanel
            workspaceSlug={workspaceSlug}
            stage={activeStage}
            tree={templateTree}
            draftSelection={draftSelection}
            hasChanges={hasTemplateChanges}
            isLoading={isTemplatesLoading}
            isSaving={isSavingTemplates}
            canEdit={canManageDevModes}
            onToggle={toggleTemplate}
            onReset={resetTemplateDraft}
            onSave={handleSaveTemplates}
          />
        )}
      </div>

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
        title={t(`${DEV_MODE_I18N}.delete_stage_modal.title`, { name: pendingDelete?.name ?? "" })}
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
