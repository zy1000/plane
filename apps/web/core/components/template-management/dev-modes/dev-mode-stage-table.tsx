import { GripVertical, Layers, Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TDevModeStage } from "@plane/types";
import { DEV_MODE_MAX_WORKLOAD_RATIO } from "@plane/types";
import { Sortable } from "@plane/ui";
import { cn } from "@plane/utils";
import { DevModeStageRow } from "./dev-mode-stage-row";
import { DEV_MODE_I18N, DEV_MODE_STAGE_ROW_GRID } from "./dev-modes-grid";

// 模块级常量：Sortable 的 effect 依赖它，每次渲染新建会重订阅
const keyExtractor = (item: TDevModeStage) => item.id;

/**
 * 阶段表（方案 A）：上面一行操作，表格本体，底栏占比合计。
 * 拖拽排序松开即保存；超 100 的占比在表单弹窗里就被挡住，底栏只负责让人随时知道还剩多少。
 */
export function DevModeStageTable({
  stages,
  activeStageId,
  totalByStageType,
  canEdit,
  workloadTotal,
  workloadRemaining,
  onOpenStage,
  onEditStage,
  onDeleteStage,
  onReorder,
  onCreate,
  onBulkCreate,
}: {
  stages: TDevModeStage[];
  activeStageId: string | null;
  /** 阶段类型 id → 可勾的评审节点数 */
  totalByStageType: Record<string, number>;
  canEdit: boolean;
  workloadTotal: number;
  workloadRemaining: number;
  onOpenStage: (stage: TDevModeStage) => void;
  onEditStage: (stage: TDevModeStage) => void;
  onDeleteStage: (stage: TDevModeStage) => void;
  onReorder: (ordered: TDevModeStage[]) => void;
  onCreate: () => void;
  onBulkCreate: () => void;
}) {
  const { t } = useTranslation();
  const canDrag = canEdit && stages.length > 1;
  const ratioPercent = Math.min(100, Math.max(0, (workloadTotal / DEV_MODE_MAX_WORKLOAD_RATIO) * 100));
  const nodeTotal = stages.reduce((sum, stage) => sum + stage.template_count, 0);

  // Sortable 的 render 与 Array.map 都会传 index，直接用
  const renderRow = (stage: TDevModeStage, index: number) => (
    <DevModeStageRow
      key={stage.id}
      stage={stage}
      index={index + 1}
      totalNodes={totalByStageType[stage.stage_type_id]}
      isActive={activeStageId === stage.id}
      canEdit={canEdit}
      canDrag={canDrag}
      onOpen={onOpenStage}
      onEdit={onEditStage}
      onDelete={onDeleteStage}
    />
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        {canDrag && (
          <span className="flex items-center gap-1.5 text-12 text-tertiary">
            <GripVertical className="size-3.5" />
            拖动调整顺序，即项目里评审分组的顺序
          </span>
        )}
        {canEdit && (
          <span className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={onBulkCreate}>
              <Layers className="size-3.5" />
              按阶段类型批量添加
            </Button>
            <Button variant="primary" onClick={onCreate}>
              <Plus className="size-3.5" />
              {t(`${DEV_MODE_I18N}.table.create`)}
            </Button>
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-subtle bg-surface-1">
        <div className={cn(DEV_MODE_STAGE_ROW_GRID, "h-[38px] shrink-0 border-b border-subtle bg-layer-1 text-12 font-medium text-tertiary")}>
          <span />
          <span />
          <span>阶段</span>
          <span>评审节点</span>
          <span className="text-right">{t(`${DEV_MODE_I18N}.table.col_ratio`)}</span>
          <span className="text-right">{t(`${DEV_MODE_I18N}.table.col_days`)}</span>
          <span />
        </div>

        <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {stages.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="grid size-10 place-items-center rounded-lg bg-layer-2 text-secondary">
                <Layers className="size-5" />
              </span>
              <p className="mt-3 text-13 font-medium text-primary">{t(`${DEV_MODE_I18N}.table.empty_title`)}</p>
              <p className="mt-1 max-w-md text-12 text-secondary">{t(`${DEV_MODE_I18N}.table.empty_description`)}</p>
            </div>
          ) : canDrag ? (
            // Sortable 没有 disabled 开关：不可拖时直接 map 绕开
            <Sortable id="dev-mode-stages" data={stages} keyExtractor={keyExtractor} onChange={onReorder} render={renderRow} />
          ) : (
            stages.map(renderRow)
          )}
        </div>

        {stages.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-subtle bg-layer-1 px-4 py-3 text-12 text-tertiary">
            <span>
              {t(`${DEV_MODE_I18N}.table.ratio_total`)}{" "}
              <b className="font-semibold tabular-nums text-primary">{workloadTotal}%</b>
            </span>
            <span className="h-1.5 w-40 overflow-hidden rounded-full bg-layer-3">
              <span className="block h-full bg-accent-primary" style={{ width: `${ratioPercent}%` }} />
            </span>
            <span>{t(`${DEV_MODE_I18N}.table.ratio_remaining`, { value: workloadRemaining })}</span>
            <span className="ml-auto tabular-nums">共 {nodeTotal} 个评审节点</span>
          </div>
        )}
      </div>
    </>
  );
}
