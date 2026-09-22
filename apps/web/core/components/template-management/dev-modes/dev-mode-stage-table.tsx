import { Layers, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TDevModeStage } from "@plane/types";
import { DEV_MODE_MAX_WORKLOAD_RATIO } from "@plane/types";
import { Checkbox, Sortable } from "@plane/ui";
import { cn } from "@plane/utils";
import { DevModeStageRow } from "./dev-mode-stage-row";
import { DEV_MODE_I18N, DEV_MODE_STAGE_ROW_GRID } from "./dev-modes-grid";

// 模块级常量：Sortable 的 effect 依赖它，每次渲染新建会重订阅
const keyExtractor = (item: TDevModeStage) => item.id;

/**
 * 阶段表：勾选 / 拖柄 / 编号 / 名称（带已勾节点数）/ 编码 / 阶段类型 / 占比 / 周期 / 操作。
 *
 * 底栏实时显示占比合计与剩余，超 100 的那一步在表单弹窗里就被挡住，这里只负责让人
 * 随时知道还剩多少可分配。
 */
export function DevModeStageTable({
  stages,
  activeStageId,
  selectedIds,
  canEdit,
  workloadTotal,
  workloadRemaining,
  onOpenStage,
  onToggleSelect,
  onToggleSelectAll,
  onEditStage,
  onDeleteStage,
  onBulkDelete,
  onReorder,
  onCreate,
  onBulkCreate,
}: {
  stages: TDevModeStage[];
  activeStageId: string | null;
  selectedIds: Set<string>;
  canEdit: boolean;
  workloadTotal: number;
  workloadRemaining: number;
  onOpenStage: (stage: TDevModeStage) => void;
  onToggleSelect: (stageId: string, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onEditStage: (stage: TDevModeStage) => void;
  onDeleteStage: (stage: TDevModeStage) => void;
  onBulkDelete: () => void;
  onReorder: (ordered: TDevModeStage[]) => void;
  onCreate: () => void;
  onBulkCreate: () => void;
}) {
  const { t } = useTranslation();
  const canDrag = canEdit && stages.length > 1;
  const allSelected = stages.length > 0 && selectedIds.size === stages.length;
  const someSelected = selectedIds.size > 0 && !allSelected;
  const ratioPercent = Math.min(100, Math.max(0, (workloadTotal / DEV_MODE_MAX_WORKLOAD_RATIO) * 100));

  // Sortable 的 render 与 Array.map 都会传 index，直接用，别再 findIndex 一遍
  const renderRow = (stage: TDevModeStage, index: number) => {
    return (
      <DevModeStageRow
        key={stage.id}
        stage={stage}
        index={index + 1}
        isActive={activeStageId === stage.id}
        isSelected={selectedIds.has(stage.id)}
        canEdit={canEdit}
        canDrag={canDrag}
        onOpen={onOpenStage}
        onToggleSelect={onToggleSelect}
        onEdit={onEditStage}
        onDelete={onDeleteStage}
      />
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-baseline gap-2 text-14 font-semibold text-primary">
          {t(`${DEV_MODE_I18N}.table.title`)}
          <span className="text-11 font-normal text-tertiary">
            {t(`${DEV_MODE_I18N}.table.subtitle`, { count: stages.length })}
          </span>
          {selectedIds.size > 0 && (
            <span className="ml-2 inline-flex items-center gap-2 border-l border-subtle pl-3 text-11 font-normal text-secondary">
              {t(`${DEV_MODE_I18N}.table.selected`, { count: selectedIds.size })}
              <button
                type="button"
                className="inline-flex h-6 items-center gap-1 rounded border border-danger-strong/40 bg-danger-subtle px-2 text-11 font-medium text-danger-primary transition-colors hover:bg-danger-subtle/80"
                onClick={onBulkDelete}
              >
                <Trash2 className="size-3" />
                {t(`${DEV_MODE_I18N}.table.delete_selected`)}
              </button>
            </span>
          )}
        </h2>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onBulkCreate}>
              <Layers className="size-3.5" />
              {t(`${DEV_MODE_I18N}.table.bulk_create`)}
            </Button>
            <Button variant="primary" onClick={onCreate}>
              <Plus className="size-3.5" />
              {t(`${DEV_MODE_I18N}.table.create`)}
            </Button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1">
        <div
          className={cn(
            DEV_MODE_STAGE_ROW_GRID,
            "h-9 shrink-0 border-b border-subtle bg-layer-1 text-11 font-medium text-tertiary"
          )}
        >
          <span>
            <Checkbox
              disabled={!canEdit || stages.length === 0}
              checked={allSelected}
              indeterminate={someSelected}
              onChange={(event) => onToggleSelectAll(event.target.checked)}
            />
          </span>
          <span />
          <span>{t(`${DEV_MODE_I18N}.table.col_index`)}</span>
          <span>{t(`${DEV_MODE_I18N}.table.col_name`)}</span>
          <span>{t(`${DEV_MODE_I18N}.table.col_code`)}</span>
          <span>{t(`${DEV_MODE_I18N}.table.col_stage_type`)}</span>
          <span className="text-right">{t(`${DEV_MODE_I18N}.table.col_ratio`)}</span>
          <span className="text-right">{t(`${DEV_MODE_I18N}.table.col_days`)}</span>
          <span />
        </div>

        <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto">
          {stages.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="grid size-10 place-items-center rounded-lg bg-layer-2 text-secondary">
                <Layers className="size-5" />
              </span>
              <p className="mt-3 text-13 font-medium text-primary">{t(`${DEV_MODE_I18N}.table.empty_title`)}</p>
              <p className="mt-1 max-w-md text-12 text-secondary">{t(`${DEV_MODE_I18N}.table.empty_description`)}</p>
              {canEdit && (
                <Button className="mt-4" variant="secondary" onClick={onBulkCreate}>
                  <Layers className="size-3.5" />
                  {t(`${DEV_MODE_I18N}.table.bulk_create`)}
                </Button>
              )}
            </div>
          ) : canDrag ? (
            // Sortable 没有 disabled 开关：不可拖时直接 map 绕开
            <Sortable
              id="dev-mode-stages"
              data={stages}
              keyExtractor={keyExtractor}
              onChange={onReorder}
              render={renderRow}
            />
          ) : (
            stages.map(renderRow)
          )}
        </div>

        {stages.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-subtle bg-surface-2 px-3 py-2 text-12 text-tertiary">
            <span className="inline-flex items-center gap-2">
              {t(`${DEV_MODE_I18N}.table.ratio_total`)}
              <b className="font-medium tabular-nums text-primary">{workloadTotal}%</b>
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-layer-3">
                <span className="block h-full bg-accent-primary" style={{ width: `${ratioPercent}%` }} />
              </span>
              {t(`${DEV_MODE_I18N}.table.ratio_remaining`, { value: workloadRemaining })}
            </span>
            {canDrag && <span>{t(`${DEV_MODE_I18N}.table.drag_hint_full`)}</span>}
          </div>
        )}
      </div>
    </>
  );
}
