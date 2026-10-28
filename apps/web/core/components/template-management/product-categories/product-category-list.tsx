import { useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import type { TProductCategory } from "@plane/types";
import { Sortable } from "@plane/ui";
import { cn } from "@plane/utils";
import { includesQuery } from "./helpers";
import { CountPill } from "./count-pill";

// 模块级常量：Sortable 的 effect 依赖它，每次渲染新建会重订阅
const keyExtractor = (category: TProductCategory) => category.id;

type Props = {
  categories: TProductCategory[];
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

/** 产品分类页左栏：标题 + 排序入口、搜索、分类列表；排序模式出拖柄与「取消 / 保存顺序」 */
export function ProductCategoryList(props: Props) {
  const {
    categories,
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
  const [query, setQuery] = useState("");
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
    const rowClass = "flex h-10 w-full items-center gap-2.5 rounded-lg border px-3 text-left text-14";
    if (sorting) {
      return (
        <div key={category.id} className={cn(rowClass, "border-subtle-1 bg-surface-1 text-primary")}>
          {content}
        </div>
      );
    }
    return (
      <button
        key={category.id}
        type="button"
        aria-pressed={isSelected}
        onClick={() => onSelect(category.id)}
        className={cn(
          rowClass,
          "transition-colors",
          isSelected
            ? "border-transparent bg-layer-1-selected font-medium text-primary"
            : "border-transparent text-secondary hover:bg-layer-transparent-hover hover:text-primary"
        )}
      >
        {content}
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-5 pb-3">
        <div className="flex h-8 items-center gap-2">
          <span className="text-[15px] font-semibold text-primary">{t("product_categories.all_categories")}</span>
          <CountPill count={categories.length} />
        </div>
        {canManage && !sorting && categories.length > 1 && (
          <Button variant="secondary" size="xl" className="px-3" onClick={onStartSort}>
            {t("product_categories.sort")}
          </Button>
        )}
      </div>

      {sorting ? (
        <>
          <p className="px-4 pb-1 text-12 text-tertiary">{t("product_categories.sort_hint")}</p>
          <div className="vertical-scrollbar scrollbar-sm flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 py-2">
            <Sortable
              id="product-categories"
              data={sortDraft}
              keyExtractor={keyExtractor}
              onChange={onSortChange}
              render={renderRow}
            />
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-subtle px-3 py-3">
            <Button variant="secondary" size="xl" className="px-3" onClick={onCancelSort} disabled={isSavingSort}>
              {t("cancel")}
            </Button>
            <Button variant="primary" size="xl" className="px-3" onClick={onSaveSort} loading={isSavingSort}>
              {t("product_categories.save_order")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="px-3 pb-2.5">
            <label className="flex h-8 items-center gap-2 rounded-md border border-subtle-1 bg-surface-1 px-2.5 text-placeholder focus-within:border-accent-strong">
              <SearchIcon className="size-3.5 shrink-0" />
              <input
                className="w-full border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
                placeholder={t("product_categories.search_placeholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <div className="vertical-scrollbar scrollbar-sm flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2.5">
            {visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-13 text-tertiary">{t("product_categories.empty.filtered")}</p>
            ) : (
              visible.map(renderRow)
            )}
          </div>
        </>
      )}
    </div>
  );
}
