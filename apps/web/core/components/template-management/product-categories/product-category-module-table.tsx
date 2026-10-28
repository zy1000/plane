import { Folder, GripVertical } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TProductCategoryModule } from "@plane/types";
import { Sortable } from "@plane/ui";
import { cn } from "@plane/utils";

// 模块级常量：Sortable 的 effect 依赖它，每次渲染新建会重订阅
const keyExtractor = (module: TProductCategoryModule) => module.id;

type Props = {
  modules: TProductCategoryModule[];
  /** 有管理权限才出「操作」列 */
  canManage: boolean;
  /** 调整顺序模式：出拖柄、收起操作列，拖完只改草稿，保存才提交 */
  sorting: boolean;
  onSortChange: (ordered: TProductCategoryModule[]) => void;
  onEdit: (module: TProductCategoryModule) => void;
  onDelete: (module: TProductCategoryModule) => void;
};

/** 分类详情里的一级模块表（通栏，无外框）：序号 · 模块名称 · 需求数 · 操作（编辑 / 删除常显） */
export function ProductCategoryModuleTable(props: Props) {
  const { modules, canManage, sorting, onSortChange, onEdit, onDelete } = props;
  const { t } = useTranslation();
  const showActions = canManage && !sorting;
  const columns = cn(
    "grid items-center",
    sorting
      ? "grid-cols-[36px_64px_minmax(0,1fr)_120px] pr-6 pl-4"
      : showActions
        ? "grid-cols-[64px_minmax(0,1fr)_120px_120px] px-6"
        : "grid-cols-[64px_minmax(0,1fr)_120px] px-6"
  );

  const renderRow = (module: TProductCategoryModule, index: number) => (
    <div key={module.id} className={cn(columns, "h-12 border-t border-subtle bg-surface-1 text-14")}>
      {sorting && (
        <span
          data-sortable-drag-handle
          className="flex cursor-grab justify-center text-tertiary active:cursor-grabbing"
          aria-label={t("product_categories.sort_hint")}
        >
          <GripVertical className="size-4" />
        </span>
      )}
      <span className="tabular-nums text-tertiary">{index + 1}</span>
      <span className="flex min-w-0 items-center gap-2.5">
        <Folder className="size-4 shrink-0 text-tertiary" strokeWidth={1.75} />
        <span className="truncate text-primary">{module.name}</span>
      </span>
      <span className="text-right tabular-nums text-secondary">{module.item_count}</span>
      {showActions && (
        <span className="flex justify-end gap-[18px]">
          <button
            type="button"
            className="text-13 text-accent-primary hover:underline"
            onClick={() => onEdit(module)}
          >
            {t("product_categories.edit")}
          </button>
          <button
            type="button"
            className="text-13 text-danger-primary hover:underline"
            onClick={() => onDelete(module)}
          >
            {t("product_categories.delete")}
          </button>
        </span>
      )}
    </div>
  );

  return (
    <div>
      <div className={cn(columns, "h-10 border-t border-subtle bg-surface-2 text-13 font-medium text-secondary")}>
        {sorting && <span />}
        <span>{t("product_categories.table.index")}</span>
        <span>{t("product_categories.table.name")}</span>
        <span className="text-right">{t("product_categories.table.item_count")}</span>
        {showActions && <span className="text-right">{t("product_categories.table.actions")}</span>}
      </div>
      {modules.length === 0 ? (
        <div className="flex h-[236px] flex-col items-center justify-center gap-3 border-t border-subtle">
          <span className="grid size-12 place-items-center rounded-xl bg-layer-1 text-tertiary">
            <Folder className="size-[22px]" strokeWidth={1.75} />
          </span>
          <span className="text-14 text-secondary">{t("product_categories.empty.modules")}</span>
        </div>
      ) : sorting ? (
        <Sortable
          id="product-category-modules"
          data={modules}
          keyExtractor={keyExtractor}
          onChange={onSortChange}
          render={renderRow}
        />
      ) : (
        modules.map(renderRow)
      )}
    </div>
  );
}
