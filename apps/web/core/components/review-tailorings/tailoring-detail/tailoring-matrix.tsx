import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TReviewTailoringItem, TReviewTailoringProduct } from "@plane/types";
import { Checkbox, CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { CellReasonPopover } from "./cell-reason-popover";
import { MatrixCell, ReadonlyCheck } from "./matrix-cell";
import type { TMatrixGroup, TMatrixRow } from "./tailoring-matrix-model";
import { countChildren, getGroupSelectionCount, getRowSelectionState } from "./tailoring-matrix-model";

const ROW_HEAD = "sticky left-0 w-[340px] min-w-[340px] max-w-[340px]";

/** 图例：四种格子与四种评审状态各是什么样子 */
const MatrixLegend = () => {
  const { t } = useTranslation();
  const dot = (tone: string, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-1.5 rounded-full bg-current", tone)} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-6 pt-3 pb-4 text-12 text-tertiary">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3.5 rounded-sm border border-strong bg-layer-1" />
        {t("review_tailoring.matrix.legend_cut")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3.5 rounded-sm border border-subtle bg-layer-3" />
        {t("review_tailoring.matrix.legend_locked")}
      </span>
      {dot("text-tertiary", t("stage_review.status.not_started"))}
      {dot("text-accent-primary", t("stage_review.status.in_review"))}
      {dot("text-warning-primary", t("stage_review.status.in_approval"))}
      {dot("text-success-primary", t("stage_review.status.completed"))}
      <span className="ml-auto inline-flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-accent-primary" />
        {t("review_tailoring.matrix.legend_dirty")}
      </span>
    </div>
  );
};

/**
 * 二维裁剪矩阵：纵轴是挑进来的评审（按阶段分段，评审活动缩进挂在所属评审下），横轴是产品。
 *
 * 表头与首列都 sticky，滚动容器是详情页的内容区（这里不再套一层 max-h 滚动框，免得双滚动）。
 * 可编辑时表尾各留一个虚线入口加评审 / 加产品；行首勾选框整行勾选 / 取消，并显示半选态。
 */
export const TailoringMatrix = ({
  groups,
  allGroups,
  items,
  products,
  editable,
  dirtyIds,
  collapsed,
  onToggleGroup,
  onToggle,
  onToggleRow,
  onReasonChange,
  onRemoveReview,
  onRemoveProduct,
  onAddReviews,
  onAddProducts,
}: {
  /** 当前筛选下要画的段 */
  groups: TMatrixGroup[];
  /** 未筛选的全部段：行首的「N 个活动」、表头的行数按它算，不随筛选变 */
  allGroups: TMatrixGroup[];
  items: TReviewTailoringItem[];
  products: TReviewTailoringProduct[];
  editable: boolean;
  dirtyIds: Set<string>;
  collapsed: Set<string>;
  onToggleGroup: (stageId: string) => void;
  onToggle: (itemId: string, selected: boolean) => void;
  onToggleRow: (row: TMatrixRow) => void;
  onReasonChange: (itemId: string, reason: string) => void;
  onRemoveReview: (row: TMatrixRow) => void;
  onRemoveProduct: (product: TReviewTailoringProduct) => void;
  onAddReviews: () => void;
  onAddProducts: () => void;
}) => {
  const { t } = useTranslation();
  const [openReason, setOpenReason] = useState<{ itemId: string; anchor: HTMLElement } | null>(null);

  const { childCount, rowCount } = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const group of allGroups) {
      total += group.rows.length;
      group.rows.forEach((row, index) => {
        if (!row.isChild) counts.set(row.templateId, countChildren(group.rows, index));
      });
    }
    return { childCount: counts, rowCount: total };
  }, [allGroups]);

  /** 本表已经写过的裁剪原因，按出现次数排，给原因气泡当快捷选项 */
  const reasonSuggestions = useMemo(() => {
    const frequency = new Map<string, number>();
    for (const item of items) {
      const reason = item.reason.trim();
      if (!item.selected && reason) frequency.set(reason, (frequency.get(reason) ?? 0) + 1);
    }
    return [...frequency.entries()].sort((a, b) => b[1] - a[1]).map(([reason]) => reason);
  }, [items]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const openItem = openReason ? itemById.get(openReason.itemId) : undefined;
  const openRowTitle = openItem?.title ?? "";

  return (
    <>
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              className={cn(
                ROW_HEAD,
                "top-0 z-[4] h-11 border-b border-subtle bg-surface-1 px-4 text-left text-12 font-normal text-tertiary"
              )}
            >
              {t("review_tailoring.matrix.review_column")}
              <span className="ml-2 text-placeholder tabular-nums">
                {t("review_tailoring.matrix.rows_count", { count: rowCount })}
              </span>
            </th>
            {products.map((product) => (
              <th
                key={product.id}
                className="group/col sticky top-0 z-[2] h-11 w-[156px] min-w-[156px] border-b border-l border-subtle bg-surface-1 px-3.5 text-left font-normal"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-13 font-medium text-primary" title={product.name}>
                    {product.name}
                  </span>
                  {editable && (
                    <div className="ml-auto opacity-0 transition-opacity group-hover/col:opacity-100 focus-within:opacity-100">
                      <CustomMenu
                        customButton={
                          <span className="grid size-5.5 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover">
                            <MoreHorizontal className="size-3.5" />
                          </span>
                        }
                        placement="bottom-end"
                        closeOnSelect
                      >
                        <CustomMenu.MenuItem
                          onClick={() => onRemoveProduct(product)}
                          className="flex items-center gap-2 text-danger-primary"
                        >
                          <Trash2 className="size-3.5" />
                          {t("review_tailoring.matrix.remove_column")}
                        </CustomMenu.MenuItem>
                      </CustomMenu>
                    </div>
                  )}
                </div>
              </th>
            ))}
            {editable && (
              <th className="sticky top-0 z-[2] h-11 w-[124px] min-w-[124px] border-b border-l border-dashed border-subtle bg-surface-1 px-2 text-left font-normal">
                <button
                  type="button"
                  className="flex h-7 items-center gap-1 rounded-md px-2 text-12 text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
                  onClick={onAddProducts}
                >
                  <Plus className="size-3.5" />
                  {t("review_tailoring.actions.add_products")}
                </button>
              </th>
            )}
            <th className="sticky top-0 z-[2] w-full border-b border-subtle bg-surface-1" aria-hidden />
          </tr>
        </thead>

        <tbody>
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.stageId);
            const { selected, total } = getGroupSelectionCount(group);
            return (
              <Fragment key={group.stageId}>
                <tr>
                  <td
                    colSpan={products.length + (editable ? 3 : 2)}
                    className="h-8.5 border-b border-subtle bg-layer-1 p-0"
                  >
                    <button
                      type="button"
                      className={cn(ROW_HEAD, "flex h-8.5 items-center gap-2 bg-layer-1 px-4 text-left")}
                      onClick={() => onToggleGroup(group.stageId)}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-3.5 shrink-0 text-tertiary" />
                      ) : (
                        <ChevronDown className="size-3.5 shrink-0 text-tertiary" />
                      )}
                      <span className="truncate text-13 font-semibold text-secondary">{group.stageLabel}</span>
                      <span className="ml-1.5 block h-1 w-16 shrink-0 overflow-hidden rounded-full bg-layer-3">
                        <span
                          className="block h-full rounded-full bg-accent-primary"
                          style={{ width: `${total ? Math.round((selected / total) * 100) : 0}%` }}
                        />
                      </span>
                      <span className="shrink-0 text-12 text-tertiary tabular-nums">
                        {selected} / {total}
                      </span>
                    </button>
                  </td>
                </tr>

                {!isCollapsed &&
                  group.rows.map((row, index) => {
                    const state = getRowSelectionState(row);
                    const cells = [...row.cells.values()];
                    const isLastChild = row.isChild && !group.rows[index + 1]?.isChild;
                    const children = childCount.get(row.templateId) ?? 0;
                    return (
                      <tr key={row.templateId} className="group">
                        <td
                          className={cn(
                            ROW_HEAD,
                            "z-[1] h-11.5 border-b border-subtle bg-surface-1 p-0 group-hover:bg-layer-1-hover"
                          )}
                        >
                          <div
                            className={cn(
                              "relative flex h-11.5 items-center gap-2.5 pr-3",
                              row.isChild ? "pl-10" : "pl-4",
                              // 子行画一段树枝：竖线连到父行，横线指向自己
                              row.isChild &&
                                "before:absolute before:top-0 before:left-6 before:border-l before:border-subtle after:absolute after:top-1/2 after:left-6 after:w-2.5 after:border-t after:border-subtle",
                              row.isChild && (isLastChild ? "before:bottom-1/2" : "before:bottom-0")
                            )}
                          >
                            {editable ? (
                              <span className="flex shrink-0 items-center" title={t("review_tailoring.matrix.select_row")}>
                                <Checkbox
                                  checked={state === "all"}
                                  indeterminate={state === "some"}
                                  disabled={cells.length === 0}
                                  onChange={() => onToggleRow(row)}
                                />
                              </span>
                            ) : (
                              <ReadonlyCheck checked={state === "all"} indeterminate={state === "some"} />
                            )}
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-primary",
                                row.isChild ? "text-13" : "text-14 font-medium"
                              )}
                              title={row.title}
                            >
                              {row.title}
                            </span>
                            <span className="shrink-0 text-12 text-placeholder tabular-nums">
                              {!row.isChild && children > 0
                                ? t("review_tailoring.actions.add_reviews_activity_count", { count: children })
                                : cells.length > 0
                                  ? `${cells.filter((cell) => cell.selected).length}/${cells.length}`
                                  : ""}
                            </span>
                            {/* 纵轴按顶层评审整块加减，所以评审活动那一行不给移除入口 */}
                            {editable && !row.isChild && (
                              <button
                                type="button"
                                title={t("review_tailoring.matrix.remove_row")}
                                className="grid size-5.5 shrink-0 place-items-center rounded-sm text-tertiary opacity-0 transition group-hover:opacity-100 hover:bg-layer-transparent-hover hover:text-danger-primary focus-visible:opacity-100"
                                onClick={() => onRemoveReview(row)}
                              >
                                <X className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </td>

                        {products.map((product) => {
                          const cell = row.cells.get(product.id);
                          if (!cell) {
                            return (
                              <td
                                key={product.id}
                                className="h-11.5 w-[156px] min-w-[156px] border-b border-l border-subtle bg-layer-1"
                              />
                            );
                          }
                          return (
                            <MatrixCell
                              key={product.id}
                              cell={cell}
                              editable={editable}
                              isDirty={dirtyIds.has(cell.id)}
                              isReasonOpen={openReason?.itemId === cell.id}
                              onToggle={(next) => onToggle(cell.id, next)}
                              onOpenReason={(anchor) =>
                                setOpenReason((current) =>
                                  current?.itemId === cell.id ? null : { itemId: cell.id, anchor }
                                )
                              }
                            />
                          );
                        })}
                        {editable && (
                          <td className="w-[124px] min-w-[124px] border-b border-l border-dashed border-subtle group-hover:bg-layer-1-hover" />
                        )}
                        <td className="border-b border-subtle group-hover:bg-layer-1-hover" />
                      </tr>
                    );
                  })}
              </Fragment>
            );
          })}

          {editable && (
            <tr>
              <td className={cn(ROW_HEAD, "z-[1] h-11 bg-surface-1 px-2")}>
                <button
                  type="button"
                  className="flex h-7 items-center gap-1.5 rounded-md px-2 text-13 text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
                  onClick={onAddReviews}
                >
                  <Plus className="size-3.5" />
                  {t("review_tailoring.actions.add_reviews")}
                </button>
              </td>
              <td colSpan={products.length + 2} />
            </tr>
          )}
        </tbody>
      </table>

      <MatrixLegend />

      {openReason && openItem && (
        <CellReasonPopover
          key={openReason.itemId}
          anchor={openReason.anchor}
          value={openItem.reason}
          subject={t("review_tailoring.matrix.reason_for", {
            product: productById.get(openItem.product_id)?.name ?? "",
            review: openRowTitle,
          })}
          suggestions={reasonSuggestions}
          editable={editable}
          onSave={(reason) => onReasonChange(openItem.id, reason)}
          onClose={() => setOpenReason(null)}
        />
      )}
    </>
  );
};
