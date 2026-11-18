import { useMemo } from "react";
import { GripVertical } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TProductCategory } from "@plane/types";
import { Sortable } from "@plane/ui";
import { cn } from "@plane/utils";
import { includesQuery } from "./helpers";

// 模块级常量：Sortable 的 effect 依赖它，每次渲染新建会重订阅
const keyExtractor = (category: TProductCategory) => category.id;

type Props = {
  categories: TProductCategory[];
  /** 页头搜索框的关键字 */
  query: string;
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
  canManage: boolean;
  /** 排序模式下的草稿顺序；null = 不在排序 */
  sortDraft: TProductCategory[] | null;
  onStartSort: () => void;
  onSortChange: (ordered: TProductCategory[]) => void;
  onCancelSort: () => void;
  onSaveSort: () => void;
  isSavingSort: boolean;
};

/** 产品模板库的贴边分类列（同评审模板库的阶段列）：标题 + 调整顺序、分类列表；排序模式出拖柄与「取消 / 保存顺序」 */
export function ProductCategoryList(props: Props) {
  const {
    categories,
    query,
    selectedId,
    onSelect,
    canManage,
    sortDraft,
    onStartSort,
    onSortChange,
    onCancelSort,
    onSaveSort,
    isSavingSort,
  } = props;
  const { t } = useTranslation();
  const sorting = sortDraft !== null;
  const visible = useMemo(
    () => (query.trim() ? categories.filter((category) => includesQuery(category.name, query)) : categories),
    [categories, query]
  );

  const renderRow = (category: TProductCategory) => {
    const isSelected = !sorting && category.id === selectedId;
    const content = (
      <>
        {sorting && <GripVertical data-sortable-drag-handle className="size-4 shrink-0 cursor-grab text-tertiary" />}
        <span className="min-w-0 flex-1 truncate">{category.name}</span>
        <span className="shrink-0 text-12 font-normal tabular-nums text-tertiary">{category.modules.length}</span>
      </>
    );
    const rowClass = "flex h-[38px] w-full shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-14";
    if (sorting) {
      return (
        <div key={category.id} className={cn(rowClass, "border border-subtle-1 bg-surface-1 text-primary")}>
          {content}
        </div>
      );
    }
    return (
      <button
        key={category.id}
        type="button"
        aria-current={isSelected ? "true" : undefined}
        onClick={() => onSelect(category.id)}
        className={cn(
          rowClass,
          "transition-colors",
          isSelected
            ? "bg-accent-subtle font-semibold text-primary"
            : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
        )}
      >
        {content}
      </button>
    );
  };

  return (
    <nav className="flex h-full min-h-0 flex-col px-2.5 py-3.5">
      <div className="flex shrink-0 items-center justify-between gap-2 px-2 pb-2">
        <h4 className="text-12 font-medium text-tertiary">
          {t("product_categories.all_categories")} · {categories.length}
        </h4>
        {canManage && !sorting && categories.length > 1 && (
          <button type="button" className="text-12 text-secondary hover:text-primary" onClick={onStartSort}>
            {t("product_categories.sort")}
          </button>
        )}
      </div>

      {sorting ? (
        <>
          <p className="px-2 pb-2 text-12 text-tertiary">{t("product_categories.sort_hint")}</p>
          <div className="vertical-scrollbar scrollbar-sm flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            <Sortable
              id="product-categories"
              data={sortDraft}
              keyExtractor={keyExtractor}
              onChange={onSortChange}
              render={renderRow}
            />
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-subtle pt-3">
            <Button variant="secondary" size="xl" className="px-3" onClick={onCancelSort} disabled={isSavingSort}>
              {t("cancel")}
            </Button>
            <Button variant="primary" size="xl" className="px-3" onClick={onSaveSort} loading={isSavingSort}>
              {t("product_categories.save_order")}
            </Button>
          </div>
        </>
      ) : (
        <div className="vertical-scrollbar scrollbar-sm flex min-h-0 flex-1 flex-col gap-px overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-2 py-6 text-center text-13 text-tertiary">{t("product_categories.empty.filtered")}</p>
          ) : (
            visible.map(renderRow)
          )}
        </div>
      )}
    </nav>
  );
}
