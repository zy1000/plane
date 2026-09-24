import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { observer } from "mobx-react";
import { Download, Layers, Plus, SearchX } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectStage } from "@plane/types";
import { EProjectStageStatus, PROJECT_STAGE_MAX_WORKLOAD_RATIO } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { PageSearchInput } from "@/components/pages/list/search-input";
import { getProjectStageError, useProjectStages } from "@/hooks/store/use-project-stages";
import { useProject } from "@/hooks/store/use-project";
import { useStageTypes } from "@/hooks/store/use-stage-types";
import { ProjectStageBulkBar } from "./bulk/project-stage-bulk-bar";
import { ProjectStageBulkEditPanel } from "./bulk/project-stage-bulk-edit-panel";
import { useProjectStageBulkEdit } from "./bulk/use-project-stage-bulk-edit";
import { useProjectStageSelection } from "./bulk/use-project-stage-selection";
import { PROJECT_STAGES_HEADER_ACTIONS_ID } from "./header-slots";
import { useProjectStagePermissions } from "./permissions";
import type { TProjectStageFormMode } from "./project-stage-form-modal";
import { ProjectStageFormModal } from "./project-stage-form-modal";
import { buildProjectStageRows } from "./project-stage-rows";
import { PROJECT_STAGE_STATUS_STYLE } from "./project-stage-status-cell";
import { ProjectStageSyncModal } from "./project-stage-sync-modal";
import { ProjectStageTable } from "./project-stage-table";

const I18N = "project_stage";

type TPendingDelete = { stage: TProjectStage } | { bulk: string[] } | null;

/**
 * 项目阶段页：页头挂点里放搜索 / 从研发模式带出 / 新建；下面一行状态计数；树形阶段表；
 * 底栏占比合计；勾选后浮动批量条（修改属性 / 删除）。
 *
 * 增删改都走 hook 重拉整棵树（父占比、层级、下移都由后端算）；批量改属性回的是改到的行，就地替换。
 */
export const ProjectStageList = observer(function ProjectStageList({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const { currentProjectDetails } = useProject();
  const { canManage } = useProjectStagePermissions(workspaceSlug, projectId);
  const { stageTypes } = useStageTypes(workspaceSlug);
  const {
    stages,
    isLoading,
    isMutating,
    error,
    createStage,
    updateStage,
    deleteStage,
    syncFromDevMode,
    applyStages,
    workloadTotal,
    workloadRemaining,
  } = useProjectStages(workspaceSlug, projectId);

  const [search, setSearch] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<TProjectStageFormMode | null>(null);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TPendingDelete>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setActionsHost(document.getElementById(PROJECT_STAGES_HEADER_ACTIONS_ID));
  }, []);

  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  // 默认全部展开：记「折叠了哪些」而不是「展开了哪些」，新加的子阶段自然是展开的
  const expandedIds = useMemo(
    () => new Set(stages.filter((stage) => !collapsedIds.has(stage.id)).map((stage) => stage.id)),
    [stages, collapsedIds]
  );
  const toggleExpand = useCallback((stageId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }, []);

  const isHit = useCallback(
    (stage: TProjectStage) => {
      const keyword = search.trim().toLowerCase();
      return !keyword || stage.name.toLowerCase().includes(keyword) || stage.code.toLowerCase().includes(keyword);
    },
    [search]
  );
  const rows = useMemo(() => buildProjectStageRows(stages, expandedIds, isHit), [stages, expandedIds, isHit]);
  const visibleIds = useMemo(() => rows.map((row) => row.stage.id), [rows]);

  const selection = useProjectStageSelection(canManage ? visibleIds : []);
  const bulkEdit = useProjectStageBulkEdit({
    workspaceSlug,
    projectId,
    selectedIds: selection.selectedIds,
    replaceSelection: selection.replace,
    applyStages,
  });

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let milestones = 0;
    let delayed = 0;
    for (const stage of stages) {
      byStatus[stage.status] = (byStatus[stage.status] ?? 0) + 1;
      if (stage.is_milestone) milestones += 1;
      if (stage.is_delayed) delayed += 1;
    }
    return { byStatus, milestones, delayed };
  }, [stages]);

  const toastError = (requestError: unknown, fallbackKey: string) => {
    const { message, code } = getProjectStageError(requestError);
    const known = code ? t(`${I18N}.errors.${code.toLowerCase()}`) : "";
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t(fallbackKey),
      message: known && known !== `${I18N}.errors.${code?.toLowerCase()}` ? known : message,
    });
  };

  const handleChangeStatus = async (stage: TProjectStage, status: EProjectStageStatus) => {
    try {
      await updateStage(stage.id, { status });
    } catch (requestError) {
      toastError(requestError, `${I18N}.toast.update_error`);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const ids = "bulk" in pendingDelete ? pendingDelete.bulk : [pendingDelete.stage.id];
    setIsDeleting(true);
    let failed = 0;
    try {
      // 逐条删：有子阶段的会 409，其余照删。父先于子勾选时父会失败，再删一次即可
      for (const id of ids) {
        try {
          await deleteStage(id);
        } catch (requestError) {
          failed += 1;
          if (ids.length === 1) toastError(requestError, `${I18N}.toast.delete_error`);
        }
      }
      if (ids.length > 1) {
        setToast({
          type: failed === 0 ? TOAST_TYPE.SUCCESS : TOAST_TYPE.WARNING,
          title: t(`${I18N}.toast.bulk_deleted`, { count: ids.length - failed, failed }),
        });
      } else if (failed === 0) {
        setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.deleted`) });
      }
      selection.clear();
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSync = async (modeStageIds: string[]) => {
    const result = await syncFromDevMode(modeStageIds);
    if (!result) return;
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: t(`${I18N}.sync.toast_success`, { count: result.created.length }),
      message:
        result.ratio_dropped.length > 0
          ? t(`${I18N}.sync.toast_ratio_dropped`, { names: result.ratio_dropped.join("、") })
          : undefined,
    });
  };

  const ratioPercent = Math.min(100, Math.max(0, (workloadTotal / PROJECT_STAGE_MAX_WORKLOAD_RATIO) * 100));
  const devMode = currentProjectDetails?.dev_mode_detail;

  const headerActions = (
    <>
      <PageSearchInput searchQuery={search} updateSearchQuery={setSearch} placeholder={t(`${I18N}.header.search`)} />
      {canManage && (
        <>
          <Button variant="secondary" size="lg" onClick={() => setIsSyncOpen(true)} disabled={!devMode}>
            <Download className="size-3.5" />
            {t(`${I18N}.header.sync`)}
          </Button>
          <Button variant="primary" size="lg" onClick={() => setForm({ mode: "create" })}>
            <Plus className="size-3.5" />
            {t(`${I18N}.header.create`)}
          </Button>
        </>
      )}
    </>
  );

  const statusOrder: EProjectStageStatus[] = [
    EProjectStageStatus.COMPLETED,
    EProjectStageStatus.IN_PROGRESS,
    EProjectStageStatus.PAUSED,
    EProjectStageStatus.NOT_STARTED,
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {actionsHost && createPortal(headerActions, actionsHost)}

      {/* 摘要条 */}
      <div className="flex h-10 shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b border-subtle px-6 text-12 text-tertiary">
        <span>
          <b className="font-semibold text-primary">{stages.length}</b> {t(`${I18N}.summary.stages`)}
        </span>
        <span>
          <b className="font-semibold text-primary">{counts.milestones}</b> {t(`${I18N}.summary.milestones`)}
        </span>
        {statusOrder.map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <i className={cn("size-1.5 rounded-full", PROJECT_STAGE_STATUS_STYLE[status].dot)} />
            {t(`${I18N}.status.${status}`)} {counts.byStatus[status] ?? 0}
          </span>
        ))}
        {counts.delayed > 0 && (
          <span className="inline-flex items-center gap-1.5 text-danger-primary">
            <i className="size-1.5 rounded-full bg-danger-primary" />
            {t(`${I18N}.summary.delayed`)} {counts.delayed}
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <Loader className="flex flex-col gap-2 p-6">
            <Loader.Item height="36px" />
            <Loader.Item height="36px" />
            <Loader.Item height="36px" />
            <Loader.Item height="36px" />
          </Loader>
        ) : error ? (
          <div className="grid h-full place-items-center p-6 text-13 text-danger-primary">{error}</div>
        ) : stages.length === 0 ? (
          <div className="grid h-full place-items-center p-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-layer-1 text-tertiary">
                <Layers className="size-6" />
              </span>
              <p className="text-14 font-medium text-primary">{t(`${I18N}.empty.title`)}</p>
              <p className="max-w-xs text-13 text-tertiary">{t(`${I18N}.empty.description`)}</p>
              {canManage && (
                <div className="mt-1 flex items-center gap-2">
                  <Button variant="secondary" size="lg" onClick={() => setIsSyncOpen(true)} disabled={!devMode}>
                    {t(`${I18N}.header.sync`)}
                  </Button>
                  <Button variant="primary" size="lg" onClick={() => setForm({ mode: "create" })}>
                    {t(`${I18N}.header.create`)}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="grid h-full place-items-center p-6">
            <div className="flex flex-col items-center gap-2 text-center text-tertiary">
              <SearchX className="size-6" />
              <p className="text-13">{t(`${I18N}.empty.no_match`)}</p>
            </div>
          </div>
        ) : (
          <ProjectStageTable
            rows={rows}
            today={today}
            canManage={canManage}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            selection={
              canManage
                ? {
                    selectedSet: selection.selectedSet,
                    allSelected: selection.allSelected,
                    someSelected: selection.someSelected,
                    onToggle: selection.toggle,
                    onToggleAll: selection.toggleAll,
                  }
                : undefined
            }
            actions={
              canManage
                ? {
                    onEdit: (stage) => setForm({ mode: "edit", stage }),
                    onAddChild: (stage) => setForm({ mode: "create-child", parent: stage }),
                    onDelete: (stage) => setPendingDelete({ stage }),
                    onChangeStatus: handleChangeStatus,
                  }
                : undefined
            }
            flashedCells={bulkEdit.flashedCells}
          />
        )}
      </div>

      {/* 底栏：占比合计 */}
      <div className="relative flex h-11 shrink-0 items-center gap-3 border-t border-subtle bg-layer-1 px-6 text-12 text-tertiary">
        <span>{t(`${I18N}.footer.ratio_total`)}</span>
        <b className="text-13 font-semibold tabular-nums text-primary">{workloadTotal}%</b>
        <span className="h-1.5 w-40 overflow-hidden rounded-full bg-layer-3">
          <span className="block h-full bg-accent-primary" style={{ width: `${ratioPercent}%` }} />
        </span>
        <span>{t(`${I18N}.footer.remaining`, { value: workloadRemaining })}</span>
        <span className="text-placeholder">·</span>
        <span>{t(`${I18N}.footer.leaf_only`)}</span>
        {canManage && (
          <ProjectStageBulkBar
            selectedCount={selection.selectedIds.length}
            onClearSelection={selection.clear}
            isEditPanelOpen={bulkEdit.isPanelOpen}
            onToggleEditPanel={bulkEdit.togglePanel}
            onDelete={() => setPendingDelete({ bulk: selection.selectedIds })}
            editPanel={
              <ProjectStageBulkEditPanel
                projectId={projectId}
                selectedCount={selection.selectedIds.length}
                submitting={bulkEdit.submitting}
                onCancel={bulkEdit.closePanel}
                onApply={(changes) => void bulkEdit.apply(changes)}
              />
            }
          />
        )}
      </div>

      <ProjectStageFormModal
        isOpen={form !== null}
        form={form}
        projectId={projectId}
        stages={stages}
        stageTypes={stageTypes}
        workloadTotal={workloadTotal}
        isSubmitting={isMutating}
        onClose={() => setForm(null)}
        onCreate={async (payload) => {
          await createStage(payload);
          setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.created`) });
        }}
        onUpdate={async (stageId, payload) => {
          await updateStage(stageId, payload);
          setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.updated`) });
        }}
      />

      <ProjectStageSyncModal
        isOpen={isSyncOpen}
        workspaceSlug={workspaceSlug}
        devModeId={currentProjectDetails?.dev_mode ?? devMode?.id}
        devModeName={devMode?.name ?? ""}
        stages={stages}
        workloadTotal={workloadTotal}
        isSubmitting={isMutating}
        onClose={() => setIsSyncOpen(false)}
        onSubmit={handleSync}
      />

      <AlertModalCore
        isOpen={Boolean(pendingDelete)}
        variant="danger"
        isSubmitting={isDeleting}
        handleClose={() => setPendingDelete(null)}
        handleSubmit={() => void handleDelete()}
        title={
          pendingDelete && "bulk" in pendingDelete
            ? t(`${I18N}.delete_modal.bulk_title`, { count: pendingDelete.bulk.length })
            : t(`${I18N}.delete_modal.title`, { name: pendingDelete && "stage" in pendingDelete ? pendingDelete.stage.name : "" })
        }
        content={t(`${I18N}.delete_modal.description`)}
        primaryButtonText={{ loading: t(`${I18N}.delete_modal.deleting`), default: t(`${I18N}.delete_modal.confirm`) }}
        secondaryButtonText={t("cancel")}
      />
    </div>
  );
});
