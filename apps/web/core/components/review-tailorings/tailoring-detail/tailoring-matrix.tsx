import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TReviewTailoringItem, TReviewTailoringProduct } from "@plane/types";
import { Checkbox, CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { CellReasonModal } from "./cell-reason-modal";
import { MatrixCell } from "./matrix-cell";
import { StageFilterChip } from "./stage-filter-chip";
import type { TCellCounts, TMatrixGroup, TMatrixRow } from "./tailoring-matrix-model";
import { collectGroupCells, countCells, countChildren, splitChildTitle } from "./tailoring-matrix-model";
import type { TCellSelection } from "./use-cell-selection";

/** 纵轴的两列：阶段 + 评审 / 评审活动。两列都钉在左侧，横向滚动时一起留下 */
const STAGE_COL = "sticky left-0 w-[136px] min-w-[136px] max-w-[136px]";
const REVIEW_COL = "sticky left-[136px] w-[292px] min-w-[292px] max-w-[292px]";
const PRODUCT_COL = "min-w-[250px]";
const ADD_COL = "w-[128px] min-w-[128px] max-w-[128px]";
/** 往右滚之后，纵轴右侧的一道投影：说明底下还压着列 */
const EDGE_SHADOW = "shadow-[6px_0_10px_-6px_rgba(0,0,0,0.18)]";
/** 换阶段的第一行：上面压一道深一点的线，顶替原来的阶段分组行 */
const STAGE_DIVIDER = "border-t border-strong";

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
      // 挂到表格外：纵轴 sticky 会自建层叠，菜单留在格内会被下一行盖住，overflow 还会裁掉
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

/** 整表 / 整列 / 整行的选中复选框：全选中是勾，选了一部分是半选 */
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
 * 二维裁剪矩阵：纵轴是挑进来的评审（阶段单独成列，评审与评审活动平铺成行），横轴是产品。
 *
 * 纵轴**不分组**：没有阶段分组行，阶段写在每一行的第一列里，换阶段时行上压一道深线。
 * 评审活动只写自己的名字（标题里带的父评审前缀由 `splitChildTitle` 剥掉），评审行加粗、活动行常规字号区分。
 * 表头压一层灰底、下沿一道深线，纵轴两列与表头都 sticky，滚动容器是详情页的内容区。
 * 阶段筛选长在「阶段」列头上；筛完一行不剩时表头仍然画出来，否则筛选入口跟着消失。
 * 产品列不定宽、撑满剩余宽度。
 * 批量：表头、列头、行首各一个复选框，勾的是「选中」（当前筛选下可见的那批格子），
 * 保留 / 裁剪由页面底部的操作条一次应用。列头小计按全表算，不随筛选变。
 * 移除行列是低频危险操作，收在「⋯」里。
 */
export const TailoringMatrix = ({
  groups,
  allGroups,
  items,
  products,
  editable,
  dirtyIds,
  isScrolled,
  stageFilter,
  emptyMessage,
  onStageFilterChange,
  onToggle,
  selection,
  onReasonChange,
  onRemoveReview,
  onRemoveProduct,
  onAddAxes,
}: {
  /** 当前筛选下要画的段（段只决定行的顺序与分隔线，不再单独占一行） */
  groups: TMatrixGroup[];
  /** 未筛选的全部段：行数与列头小计按它算 */
  allGroups: TMatrixGroup[];
  items: TReviewTailoringItem[];
  products: TReviewTailoringProduct[];
  editable: boolean;
  dirtyIds: Set<string>;
  /** 容器已经往右滚：纵轴画一道投影 */
  isScrolled: boolean;
  /** 只看某个阶段的行。null = 全部阶段；入口是「阶段」列头上的漏斗 */
  stageFilter: string | null;
  /** 筛完一行不剩时写在表体里的那句话。表头照旧画出来 —— 否则筛选入口跟着消失，没法退回去 */
  emptyMessage?: string;
  onStageFilterChange: (stageId: string | null) => void;
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

  const { childCount, rowCount } = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const group of allGroups) {
      total += group.rows.length;
      group.rows.forEach((row, index) => {
        // 按行键计数：同一个评审在 o-1、o-2 下各是一行，用 templateId 会互相覆盖
        if (!row.isChild) counts.set(row.rowKey, countChildren(group.rows, index));
      });
    }
    return { childCount: counts, rowCount: total };
  }, [allGroups]);

  /** 阶段筛选的选项：各段多少行，按全表算（不跟当前筛选走，免得选项自己越筛越少） */
  const stageOptions = allGroups.map((group) => ({
    id: group.stageId,
    label: group.stageLabel,
    hint: t("review_tailoring.matrix.rows_count", { count: group.rows.length }),
  }));

  const productCounts = useMemo(
    () => new Map(products.map((product) => [product.id, countCells(collectGroupCells(allGroups, product.id))])),
    [allGroups, products]
  );

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const openItem = openReasonId ? itemById.get(openReasonId) : undefined;

  return (
    <>
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              data-row-head
              className={cn(
                STAGE_COL,
                "top-0 z-[5] h-12 border-b border-strong bg-layer-1 pr-2 pl-6 text-left text-12 font-normal text-tertiary"
              )}
            >
              <div className="flex items-center gap-1.5">
                {editable && (
                  <ScopeCheckbox
                    cells={collectGroupCells(groups)}
                    selection={selection}
                    label={t("review_tailoring.matrix.select_all")}
                  />
                )}
                <span className="mr-0.5 min-w-0 truncate">{t("review_tailoring.matrix.stage_column")}</span>
                {/* 筛选长在字段上：选中的阶段名每一行都写着，这里只留漏斗与清除 */}
                <StageFilterChip
                  variant="icon"
                  label={t("review_tailoring.matrix.stage_filter")}
                  allLabel={t("review_tailoring.detail.filter_all")}
                  value={stageFilter}
                  options={stageOptions}
                  allHint={t("review_tailoring.matrix.rows_count", { count: rowCount })}
                  onChange={onStageFilterChange}
                />
              </div>
            </th>
            <th
              data-row-head
              className={cn(
                REVIEW_COL,
                "top-0 z-[4] h-12 border-b border-strong bg-layer-1 pr-3 text-left text-12 font-normal text-tertiary",
                isScrolled && EDGE_SHADOW
              )}
            >
              <span className="flex min-w-0">
                <span className="truncate">
                  {t("review_tailoring.matrix.review_column")}
                  <span className="ml-1.5 text-placeholder tabular-nums">
                    {t("review_tailoring.matrix.rows_count", { count: rowCount })}
                  </span>
                </span>
              </span>
            </th>
            {products.map((product) => (
              <th
                key={product.id}
                data-product-col
                className={cn(
                  PRODUCT_COL,
                  "sticky top-0 z-[2] h-12 border-b border-l border-strong bg-layer-1 px-3.5 text-left font-normal"
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
                    {/* 列头写开发编号：产品名往往很长，一屏摆不下几列；全名挂在 hover 上 */}
                    <Tooltip tooltipContent={product.name}>
                      <span className="w-fit max-w-full truncate text-13 font-semibold text-primary">
                        {product.identifier || product.name}
                      </span>
                    </Tooltip>
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
                  "sticky top-0 z-[2] h-12 border-b border-strong border-l border-dashed border-l-subtle bg-layer-1 px-2 text-left font-normal"
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
          {groups.length === 0 && emptyMessage && (
            <tr>
              <td colSpan={products.length + (editable ? 3 : 2)} className="border-b border-subtle p-0">
                <p className="px-6 py-10 text-13 text-tertiary">{emptyMessage}</p>
              </td>
            </tr>
          )}
          {groups.flatMap((group, groupIndex) =>
            group.rows.map((row, index) => {
              const cells = [...row.cells.values()];
              const children = childCount.get(row.rowKey) ?? 0;
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
              const { rest } = splitChildTitle(parentTitle, row.title);
              const isRowSelected = editable && cells.length > 0 && selection.stateOf(cells) === "all";
              // 段与段之间那道深线；第一段上面已经是表头，不用再画
              const divider = index === 0 && groupIndex > 0 && STAGE_DIVIDER;
              const headBg = isRowSelected ? "bg-accent-subtle" : "bg-surface-1 group-hover:bg-layer-1-hover";
              return (
                <tr key={row.rowKey} className="group">
                  <td className={cn(STAGE_COL, "z-[1] h-11.5 border-b border-subtle p-0", headBg, divider)}>
                    <div className="flex h-11.5 items-center gap-2.5 pr-2 pl-6">
                      {editable && (
                        <ScopeCheckbox
                          cells={cells}
                          selection={selection}
                          label={t("review_tailoring.matrix.select_row")}
                        />
                      )}
                      <span className="min-w-0 truncate text-13 text-secondary" title={group.stageLabel}>
                        {group.stageLabel}
                      </span>
                    </div>
                  </td>

                  <td
                    className={cn(
                      REVIEW_COL,
                      "z-[1] h-11.5 border-b border-subtle p-0",
                      headBg,
                      divider,
                      isScrolled && EDGE_SHADOW
                    )}
                  >
                    <div className="flex h-11.5 items-center gap-2 pr-3">
                      {/* 活动只写自己的名字：父评审名由 splitChildTitle 剥掉，不在行里重复一遍 */}
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-primary",
                          row.isChild ? "text-13" : "text-14 font-semibold"
                        )}
                        title={row.title}
                      >
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
                          className={cn(PRODUCT_COL, "h-11.5 border-b border-l border-subtle bg-layer-1", divider)}
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
                        className={divider || undefined}
                        onToggle={(next) => onToggle(cell.id, next)}
                        onOpenReason={() => setOpenReasonId(cell.id)}
                      />
                    );
                  })}
                  {editable && (
                    <td
                      className={cn(
                        ADD_COL,
                        "border-b border-l border-dashed border-subtle group-hover:bg-layer-1-hover",
                        divider
                      )}
                    />
                  )}
                </tr>
              );
            })
          )}

          {editable && (
            <tr>
              {/* 跨两列：宽度由上面的纵轴两列决定，不再自带宽度 */}
              <td colSpan={2} className={cn("sticky left-0 z-[1] h-11 bg-surface-1 px-4", isScrolled && EDGE_SHADOW)}>
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
