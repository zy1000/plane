import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TReviewTailoringItem, TReviewTailoringProduct } from "@plane/types";
import { Checkbox, CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { CellReasonModal } from "./cell-reason-modal";
import { MatrixCell } from "./matrix-cell";
import { StackBar } from "./stack-bar";
import type { TCellCounts, TMatrixGroup, TMatrixRow } from "./tailoring-matrix-model";
import { collectGroupCells, countCells, countChildren, splitChildTitle } from "./tailoring-matrix-model";
import type { TCellSelection } from "./use-cell-selection";

const ROW_HEAD = "sticky left-0 w-[380px] min-w-[380px] max-w-[380px]";
const PRODUCT_COL = "min-w-[250px]";
const ADD_COL = "w-[128px] min-w-[128px] max-w-[128px]";
/** 往右滚之后，首列右侧的一道投影：说明底下还压着列 */
const EDGE_SHADOW = "shadow-[6px_0_10px_-6px_rgba(0,0,0,0.18)]";

type TAxisMenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onClick: () => void;
};

/** 行 / 列的「⋯」菜单，只放「移除」 */
const AxisMenu = ({ items, portalElement }: { items: TAxisMenuItem[]; portalElement?: HTMLElement | null }) => {
  const { t } = useTranslation();
  return (
    <CustomMenu
      customButton={
        <span
          title={t("review_tailoring.detail.more")}
          className="grid size-6 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
        >
          <MoreHorizontal className="size-3.5" />
        </span>
      }
      placement="bottom-end"
      closeOnSelect
      // 挂到表格外：首列 sticky 会自建层叠，菜单留在格内会被下一行盖住，overflow 还会裁掉
      portalElement={portalElement}
    >
      {items.map((item) => (
        <CustomMenu.MenuItem
          key={item.key}
          onClick={item.onClick}
          className={cn("flex items-center gap-2", item.danger && "text-danger-primary")}
        >
          {item.icon}
          {item.label}
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
};

/** 整表 / 整列 / 整段 / 整行的选中复选框：全选中是勾，选了一部分是半选 */
const ScopeCheckbox = ({
  cells,
  selection,
  label,
}: {
  cells: TReviewTailoringItem[];
  selection: TCellSelection;
  label: string;
}) => {
  const state = selection.stateOf(cells);
  return (
    <Checkbox
      checked={state === "all"}
      indeterminate={state === "some"}
      disabled={cells.length === 0}
      onChange={() => selection.toggle(cells)}
      aria-label={label}
      title={label}
    />
  );
};

/** 「64 保留 · 2 裁剪 · 1 待补原因」 */
const CellSummary = ({ counts }: { counts: TCellCounts }) => {
  const { t } = useTranslation();
  return (
    <span className="truncate tabular-nums">
      {t("review_tailoring.matrix.summary", { kept: counts.kept, cut: counts.cut })}
      {counts.missing > 0 && (
        <span className="text-warning-primary">
          {" · "}
          {t("review_tailoring.matrix.summary_missing", { count: counts.missing })}
        </span>
      )}
    </span>
  );
};

/**
 * 二维裁剪矩阵：纵轴是挑进来的评审（按阶段分段，评审活动缩进挂在所属评审下），横轴是产品。
 *
 * 表头与首列都 sticky，滚动容器是详情页的内容区。产品列不定宽、撑满剩余宽度。
 * 批量：表头、列头、阶段行、行首各一个复选框，勾的是「选中」（当前筛选下可见的那批格子），
 * 保留 / 裁剪由页面底部的操作条一次应用。列头与阶段行的小计按全表算，不随筛选变。
 * 移除行列是低频危险操作，收在「⋯」里。
 */
export const TailoringMatrix = ({
  groups,
  allGroups,
  items,
  products,
  editable,
  dirtyIds,
  collapsed,
  isScrolled,
  onToggleGroup,
  onToggle,
  selection,
  onReasonChange,
  onRemoveReview,
  onRemoveProduct,
  onAddAxes,
}: {
  /** 当前筛选下要画的段 */
  groups: TMatrixGroup[];
  /** 未筛选的全部段：行数、列头与阶段行的小计按它算 */
  allGroups: TMatrixGroup[];
  items: TReviewTailoringItem[];
  products: TReviewTailoringProduct[];
  editable: boolean;
  dirtyIds: Set<string>;
  collapsed: Set<string>;
  /** 容器已经往右滚：首列画一道投影 */
  isScrolled: boolean;
  onToggleGroup: (stageId: string) => void;
  onToggle: (itemId: string, selected: boolean) => void;
  /** 批量选中，由页面持有：底部操作条要读它 */
  selection: TCellSelection;
  onReasonChange: (itemId: string, reason: string) => void;
  onRemoveReview: (row: TMatrixRow) => void;
  onRemoveProduct: (product: TReviewTailoringProduct) => void;
  onAddAxes: () => void;
}) => {
  const { t } = useTranslation();
  const [openReasonId, setOpenReasonId] = useState<string | null>(null);
  const [menuPortalEl, setMenuPortalEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMenuPortalEl(document.body);
  }, []);

  const { childCount, rowCount, stageCounts } = useMemo(() => {
    const counts = new Map<string, number>();
    const byStage = new Map<string, TCellCounts>();
    let total = 0;
    for (const group of allGroups) {
      total += group.rows.length;
      byStage.set(group.stageId, countCells(collectGroupCells([group])));
      group.rows.forEach((row, index) => {
        if (!row.isChild) counts.set(row.templateId, countChildren(group.rows, index));
      });
    }
    return { childCount: counts, rowCount: total, stageCounts: byStage };
  }, [allGroups]);

  const productCounts = useMemo(
    () => new Map(products.map((product) => [product.id, countCells(collectGroupCells(allGroups, product.id))])),
    [allGroups, products]
  );

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const openItem = openReasonId ? itemById.get(openReasonId) : undefined;

  const stageColSpan = products.length + (editable ? 2 : 1);

  return (
    <>
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              data-row-head
              className={cn(
                ROW_HEAD,
                "top-0 z-[4] h-12 border-b border-subtle bg-surface-1 pr-3 pl-6 text-left text-12 font-normal text-tertiary",
                isScrolled && EDGE_SHADOW
              )}
            >
              <div className="flex items-center gap-2.5">
                {editable && (
                  <ScopeCheckbox
                    cells={collectGroupCells(groups)}
                    selection={selection}
                    label={t("review_tailoring.matrix.select_all")}
                  />
                )}
                <span className="min-w-0 truncate">
                  {t("review_tailoring.matrix.review_column")}
                  <span className="ml-1.5 text-placeholder tabular-nums">
                    {t("review_tailoring.matrix.rows_count", { count: rowCount })}
                  </span>
                </span>
              </div>
            </th>
            {products.map((product) => (
              <th
                key={product.id}
                data-product-col
                className={cn(
                  PRODUCT_COL,
                  "sticky top-0 z-[2] h-12 border-b border-l border-subtle bg-surface-1 px-3.5 text-left font-normal"
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {editable && (
                    <ScopeCheckbox
                      cells={collectGroupCells(groups, product.id)}
                      selection={selection}
                      label={t("review_tailoring.matrix.select_column")}
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-13 font-semibold text-primary" title={product.name}>
                      {product.name}
                    </span>
                    <span className="flex min-w-0 text-12 text-tertiary">
                      <CellSummary counts={productCounts.get(product.id) ?? { kept: 0, cut: 0, missing: 0 }} />
                    </span>
                  </div>
                  {editable && (
                    <AxisMenu
                      portalElement={menuPortalEl}
                      items={[
                        {
                          key: "remove",
                          label: t("review_tailoring.matrix.remove_column"),
                          icon: <Trash2 className="size-3.5" />,
                          danger: true,
                          onClick: () => onRemoveProduct(product),
                        },
                      ]}
                    />
                  )}
                </div>
              </th>
            ))}
            {editable && (
              <th
                className={cn(
                  ADD_COL,
                  "sticky top-0 z-[2] h-12 border-b border-l border-dashed border-subtle bg-surface-1 px-2 text-left font-normal"
                )}
              >
                <button
                  type="button"
                  className="flex h-7 items-center gap-1 rounded-md px-2 text-12 whitespace-nowrap text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
                  onClick={onAddAxes}
                >
                  <Plus className="size-3.5" />
                  {t("review_tailoring.actions.add_products")}
                </button>
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.stageId);
            const counts = stageCounts.get(group.stageId) ?? { kept: 0, cut: 0, missing: 0 };
            return (
              <Fragment key={group.stageId}>
                <tr>
                  <td colSpan={stageColSpan} className="h-9 border-b border-subtle bg-layer-1 p-0">
                    <div
                      className={cn(
                        ROW_HEAD,
                        "flex h-9 items-center gap-2.5 bg-layer-1 pr-3 pl-6",
                        isScrolled && EDGE_SHADOW
                      )}
                    >
                      {editable && (
                        <ScopeCheckbox
                          cells={collectGroupCells([group])}
                          selection={selection}
                          label={t("review_tailoring.matrix.select_stage")}
                        />
                      )}
                      <button
                        type="button"
                        className="flex min-w-0 shrink items-center gap-1.5 text-left"
                        onClick={() => onToggleGroup(group.stageId)}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="size-3.5 shrink-0 text-tertiary" />
                        ) : (
                          <ChevronDown className="size-3.5 shrink-0 text-tertiary" />
                        )}
                        <span className="truncate text-13 font-semibold text-secondary">{group.stageLabel}</span>
                      </button>
                      <StackBar kept={counts.kept} cut={counts.cut} missing={counts.missing} className="h-1 w-16" />
                      <span className="flex min-w-0 flex-1 text-12 text-tertiary">
                        <CellSummary counts={counts} />
                      </span>
                    </div>
                  </td>
                </tr>

                {!isCollapsed &&
                  group.rows.map((row, index) => {
                    const cells = [...row.cells.values()];
                    const isLastChild = row.isChild && !group.rows[index + 1]?.isChild;
                    const children = childCount.get(row.templateId) ?? 0;
                    const cutCount = cells.filter((cell) => !cell.selected).length;
                    let parentTitle: string | undefined;
                    if (row.isChild) {
                      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
                        if (!group.rows[cursor].isChild) {
                          parentTitle = group.rows[cursor].title;
                          break;
                        }
                      }
                    }
                    const { prefix, rest } = splitChildTitle(parentTitle, row.title);
                    const isRowSelected = editable && selection.stateOf(cells) === "all";
                    return (
                      <tr key={row.templateId} className="group">
                        <td
                          className={cn(
                            ROW_HEAD,
                            "z-[1] h-11.5 border-b border-subtle p-0",
                            isRowSelected ? "bg-accent-subtle" : "bg-surface-1 group-hover:bg-layer-1-hover",
                            isScrolled && EDGE_SHADOW
                          )}
                        >
                          <div
                            className={cn(
                              "relative flex h-11.5 items-center gap-2.5 pr-3",
                              row.isChild ? "pl-12" : "pl-6",
                              // 子行画一段树枝：竖线连到父行，横线指向自己
                              row.isChild &&
                                "before:absolute before:top-0 before:left-8 before:border-l before:border-subtle after:absolute after:top-1/2 after:left-8 after:w-2.5 after:border-t after:border-subtle",
                              row.isChild && (isLastChild ? "before:bottom-1/2" : "before:bottom-0")
                            )}
                          >
                            {editable && (
                              <ScopeCheckbox
                                cells={cells}
                                selection={selection}
                                label={t("review_tailoring.matrix.select_row")}
                              />
                            )}
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-primary",
                                row.isChild ? "text-13" : "text-14 font-semibold"
                              )}
                              title={row.title}
                            >
                              {prefix && <span className="font-normal text-placeholder">{prefix}</span>}
                              {rest}
                            </span>
                            {!row.isChild && children > 0 ? (
                              <span className="shrink-0 text-12 text-placeholder tabular-nums">
                                {t("review_tailoring.actions.add_reviews_activity_count", { count: children })}
                              </span>
                            ) : (
                              cutCount > 0 && (
                                <span className="shrink-0 rounded-full bg-layer-3 px-1.5 text-11 leading-5 text-secondary tabular-nums">
                                  {t("review_tailoring.matrix.row_cut_count", { count: cutCount })}
                                </span>
                              )
                            )}
                            {editable && (
                              <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                <AxisMenu
                                  portalElement={menuPortalEl}
                                  items={[
                                    {
                                      key: "remove",
                                      label: t("review_tailoring.matrix.remove_row"),
                                      icon: <Trash2 className="size-3.5" />,
                                      danger: true,
                                      onClick: () => onRemoveReview(row),
                                    },
                                  ]}
                                />
                              </span>
                            )}
                          </div>
                        </td>

                        {products.map((product) => {
                          const cell = row.cells.get(product.id);
                          if (!cell) {
                            return (
                              <td
                                key={product.id}
                                className={cn(PRODUCT_COL, "h-11.5 border-b border-l border-subtle bg-layer-1")}
                              />
                            );
                          }
                          return (
                            <MatrixCell
                              key={product.id}
                              cell={cell}
                              editable={editable}
                              isDirty={dirtyIds.has(cell.id)}
                              isSelected={editable && selection.selectedIds.has(cell.id)}
                              onToggle={(next) => onToggle(cell.id, next)}
                              onOpenReason={() => setOpenReasonId(cell.id)}
                            />
                          );
                        })}
                        {editable && (
                          <td
                            className={cn(
                              ADD_COL,
                              "border-b border-l border-dashed border-subtle group-hover:bg-layer-1-hover"
                            )}
                          />
                        )}
                      </tr>
                    );
                  })}
              </Fragment>
            );
          })}

          {editable && (
            <tr>
              <td className={cn(ROW_HEAD, "z-[1] h-11 bg-surface-1 px-4", isScrolled && EDGE_SHADOW)}>
                <button
                  type="button"
                  className="flex h-7 items-center gap-1.5 rounded-md px-2 text-13 text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
                  onClick={onAddAxes}
                >
                  <Plus className="size-3.5" />
                  {t("review_tailoring.actions.add_reviews")}
                </button>
              </td>
              <td colSpan={products.length + 1} />
            </tr>
          )}
        </tbody>
      </table>

      <CellReasonModal
        isOpen={Boolean(openItem)}
        value={openItem?.reason ?? ""}
        editable={editable}
        onSave={(reason) => {
          if (openItem) onReasonChange(openItem.id, reason);
        }}
        onClose={() => setOpenReasonId(null)}
      />
    </>
  );
};
