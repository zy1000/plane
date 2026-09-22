import { useCallback, useState } from "react";
import { Milestone, Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TStageType } from "@plane/types";
import { AlertModalCore, Loader, Sortable } from "@plane/ui";
import { cn } from "@plane/utils";
import { SettingsHeading } from "@/components/settings/heading";
import { useStageTypes } from "@/hooks/store/use-stage-types";
import { StageTypeFormModal, type TStageTypeFormValue } from "./stage-type-form-modal";
import { StageTypeRow } from "./stage-type-row";
import { STAGE_TYPE_ROW_GRID } from "./stage-types-grid";

const I18N = "workspace_settings.settings.stage_types";
// 模块级常量：Sortable 的 effect 依赖它，每次渲染新建会重订阅
const keyExtractor = (item: TStageType) => item.id;

type TEditorState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; stageType: TStageType };

/**
 * 阶段类型设置页：一张不分页的 div + CSS grid 表（十来条，分页没有意义）。
 *
 * 预置类型（is_system）只能改描述和顺序，删除按钮常驻置灰；自定义类型被评审模板引用时
 * 后端回 409，这里把它翻成一条说人话的 toast。
 */
export function StageTypesRoot({ workspaceSlug, canEdit }: { workspaceSlug: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const {
    stageTypes,
    isLoading,
    isMutating,
    error,
    fetchStageTypes,
    createStageType,
    updateStageType,
    deleteStageType,
    reorderStageTypes,
  } = useStageTypes(workspaceSlug);

  const [editor, setEditor] = useState<TEditorState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = useState<TStageType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const presetCount = stageTypes.filter((item) => item.is_system).length;
  const canDrag = canEdit && stageTypes.length > 1;

  const handleSubmit = useCallback(
    async (value: TStageTypeFormValue) => {
      if (editor.mode === "edit") {
        const { stageType } = editor;
        // 预置的编码与名称是只读的，别把原值再发一遍触发后端的只读校验
        await updateStageType(
          stageType.id,
          stageType.is_system
            ? { description: value.description }
            : { code: value.code, name: value.name, description: value.description }
        );
        setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.updated`) });
      } else {
        await createStageType(value);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.created`) });
      }
      setEditor({ mode: "closed" });
    },
    [createStageType, editor, t, updateStageType]
  );

  const handleDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteStageType(pendingDelete.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.deleted`) });
      setPendingDelete(null);
    } catch (deleteError) {
      const payload = deleteError as { code?: string; error?: string } | undefined;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(`${I18N}.toast.delete_failed`, { name: pendingDelete.name }),
        message:
          payload?.code === "STAGE_TYPE_IN_USE"
            ? t(`${I18N}.errors.stage_type_in_use`)
            : (payload?.error ?? t(`${I18N}.errors.generic`)),
      });
    } finally {
      setIsDeleting(false);
    }
  }, [deleteStageType, pendingDelete, t]);

  const handleReorder = useCallback(
    (ordered: TStageType[]) => {
      void reorderStageTypes(ordered.map((item) => item.id)).catch(() => {
        setToast({ type: TOAST_TYPE.ERROR, title: t(`${I18N}.toast.reorder_failed`) });
      });
    },
    [reorderStageTypes, t]
  );

  const renderRow = (stageType: TStageType) => (
    <StageTypeRow
      key={stageType.id}
      stageType={stageType}
      canEdit={canEdit}
      canDrag={canDrag}
      onEdit={(item) => setEditor({ mode: "edit", stageType: item })}
      onDelete={setPendingDelete}
    />
  );

  const renderBody = () => {
    if (stageTypes.length === 0) {
      return (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span className="grid size-10 place-items-center rounded-lg bg-layer-2 text-secondary">
            <Milestone className="size-5" />
          </span>
          <p className="mt-3 text-13 font-medium text-primary">{t(`${I18N}.empty.title`)}</p>
          <p className="mt-1 max-w-md text-12 text-secondary">{t(`${I18N}.empty.description`)}</p>
        </div>
      );
    }
    // Sortable 没有 disabled 开关：不可拖时直接 map 绕开
    if (!canDrag) return stageTypes.map(renderRow);
    return (
      <Sortable
        id="stage-types"
        data={stageTypes}
        keyExtractor={keyExtractor}
        onChange={handleReorder}
        render={renderRow}
      />
    );
  };

  return (
    <div className="flex w-full flex-col">
      <SettingsHeading
        title={t(`${I18N}.title`)}
        description={t(`${I18N}.description`)}
        control={
          canEdit ? (
            <Button variant="primary" size="lg" onClick={() => setEditor({ mode: "create" })}>
              <Plus className="size-3.5" />
              {t(`${I18N}.create`)}
            </Button>
          ) : undefined
        }
      />

      <div className="mt-6">
        {isLoading ? (
          <Loader className="overflow-hidden rounded-lg border border-subtle">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className={cn(STAGE_TYPE_ROW_GRID, "h-11 border-b border-subtle last:border-b-0")}>
                <span />
                <Loader.Item height="14px" width="52px" />
                <Loader.Item height="14px" width="88px" />
                <Loader.Item height="14px" width="180px" />
                <Loader.Item height="18px" width="44px" />
                <span />
              </div>
            ))}
          </Loader>
        ) : error ? (
          <div className="rounded-lg border border-subtle p-10 text-center">
            <p className="text-13 font-medium text-primary">{t(`${I18N}.errors.load_failed`)}</p>
            <p className="mt-1 text-12 text-secondary">{error}</p>
            <Button className="mt-4" variant="secondary" size="lg" onClick={() => void fetchStageTypes()}>
              {t("retry")}
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-subtle bg-surface-1">
            <div
              className={cn(
                STAGE_TYPE_ROW_GRID,
                "h-9 border-b border-subtle bg-layer-1 text-11 font-medium text-tertiary"
              )}
            >
              <span />
              <span>{t(`${I18N}.table.col_code`)}</span>
              <span>{t(`${I18N}.table.col_name`)}</span>
              <span>{t(`${I18N}.table.col_description`)}</span>
              <span>{t(`${I18N}.table.col_source`)}</span>
              <span />
            </div>
            {renderBody()}
            {stageTypes.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-subtle bg-surface-2 px-3 py-2 text-12 text-tertiary">
                <span>{t(`${I18N}.table.summary`, { total: stageTypes.length, preset: presetCount })}</span>
                {canDrag && <span>{t(`${I18N}.table.drag_hint_full`)}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      <StageTypeFormModal
        isOpen={editor.mode !== "closed"}
        stageType={editor.mode === "edit" ? editor.stageType : null}
        isSubmitting={isMutating}
        onClose={() => setEditor({ mode: "closed" })}
        onSubmit={handleSubmit}
      />

      <AlertModalCore
        isOpen={Boolean(pendingDelete)}
        variant="danger"
        isSubmitting={isDeleting}
        handleClose={() => setPendingDelete(null)}
        handleSubmit={() => void handleDelete()}
        title={t(`${I18N}.delete_modal.title`, { name: pendingDelete?.name ?? "" })}
        content={t(`${I18N}.delete_modal.description`)}
        primaryButtonText={{ default: t(`${I18N}.delete_modal.confirm`), loading: t(`${I18N}.delete_modal.deleting`) }}
        secondaryButtonText={t("cancel")}
      />
    </div>
  );
}
