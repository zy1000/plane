import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { EStageReviewKind, TReviewTailoringItem, TReviewTailoringProduct } from "@plane/types";
import { STAGE_REVIEW_ACTIVITY_KINDS } from "@plane/types";
import { Checkbox, CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { StageReviewKindBadge } from "@/components/template-management/reviews/stage-review-kind-badge";
import { PLAIN_ACTION, PLAIN_ACTION_DANGER, PLAIN_TABLE, PLAIN_TD, PLAIN_TH } from "../plain-table";
import { CellReasonModal } from "./cell-reason-modal";
import { ResultSelect, ResultText } from "./result-select";
import { StageFilterChip } from "./stage-filter-chip";
import type { TMatrixGroup, TMatrixRow } from "./tailoring-matrix-model";
import {
  collectGroupCells,
  countCells,
  getCellLockReason,
  getMoveBlockReason,
  isCompletedCut,
  splitChildTitle,
} from "./tailoring-matrix-model";
import type { TCellSelection } from "./use-cell-selection";

/** 钉在左侧的三列：勾选、阶段、评审 / 评审活动 */
const SELECT_WIDTH = 40;
const STAGE_WIDTH = 128;
const REVIEW_WIDTH = 336;
/** 标准编号在评审名称格里定宽打头，评审活动的缩进放在编号之后，编号竖向对齐 */
const CODE_CLASS = "w-16 shrink-0 truncate font-mono text-12 tabular-nums";
/** 两级表头每一级的高度 */
const HEAD_ROW = 34;
/** 往右滚之后，钉住的最后一列右侧的一道投影：说明底下还压着列 */
const EDGE_SHADOW = "shadow-[6px_0_10px_-6px_rgba(0,0,0,0.18)]";

const fixedWidth = (width: number) => ({ width, minWidth: width, maxWidth: width });

/** 已生成评审的状态色点，与阶段评审页同一套语义色 */
const REVIEW_STATUS_TONE: Record<string, string> = {
  not_started: "text-placeholder",
  in_review: "text-accent-primary",
  in_approval: "text-warning-primary",
  completed: "text-success-primary",
};

/** 表头 / 行首的选中复选框：全选中是勾，选了一部分是半选 */
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

/**
 * 裁剪矩阵：一张普通表格。纵轴是挑进来的评审与评审活动（阶段、类型各占一列），横轴是产品。
 *
 * 表头两级：产品名跨在「结果 | 裁剪原因」上面；有评审已经生成过时再多一列「评审状态」。
 * 勾选、阶段、评审三列钉在左侧，产品多了横向滚动。「裁剪原因」列不定宽，吃掉剩余宽度。
 *
 * 可编辑时：行首复选框选中整行（选中的单位仍是格子，保留 / 裁剪由页面底部的操作条一次应用），
 * 「结果」是下拉，行尾「操作」列是移动阶段 / 移除，产品列头的菜单管整列。
 * 评审活动只写自己的名字（标题里带的父评审前缀由 `splitChildTitle` 剥掉）并缩进一级。
 * 筛完一行不剩时表头仍然画出来，否则「阶段」列头上的筛选入口跟着消失。
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
  onMoveCells,
  onRemoveProduct,
  onSetColumn,
}: {
  /** 当前筛选下要画的段（段只决定行的顺序） */
  groups: TMatrixGroup[];
  /** 未筛选的全部段：阶段筛选的选项与列头小计按它算 */
  allGroups: TMatrixGroup[];
  items: TReviewTailoringItem[];
  products: TReviewTailoringProduct[];
  editable: boolean;
  dirtyIds: Set<string>;
  /** 容器已经往右滚：钉住的列画一道投影 */
  isScrolled: boolean;
  /** 只看某个阶段的行。null = 全部阶段；入口是「阶段」列头上的漏斗 */
  stageFilter: string | null;
  /** 筛完一行不剩时写在表体里的那句话 */
  emptyMessage?: string;
  onStageFilterChange: (stageId: string | null) => void;
  onToggle: (itemId: string, selected: boolean) => void;
  /** 批量选中，由页面持有：底部操作条要读它 */
  selection: TCellSelection;
  onReasonChange: (itemId: string, reason: string) => void;
  onRemoveReview: (row: TMatrixRow) => void;
  /** 把这一行能挪的格子交给页面开「移到阶段」弹窗 */
  onMoveCells: (cells: TReviewTailoringItem[]) => void;
  onRemoveProduct: (product: TReviewTailoringProduct) => void;
  /** 产品列头菜单的「整列保留 / 整列裁剪」：作用于当前筛选下这一列看得见的格子 */
  onSetColumn: (cells: TReviewTailoringItem[], selected: boolean) => void;
}) => {
  const { t } = useTranslation();
  const [openReasonId, setOpenReasonId] = useState<string | null>(null);
  const [menuPortalEl, setMenuPortalEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMenuPortalEl(document.body);
  }, []);

  const rowCount = allGroups.reduce((total, group) => total + group.rows.length, 0);
  /** 阶段筛选的选项：各段多少行，按全表算（不跟当前筛选走，免得选项自己越筛越少） */
  const stageOptions = allGroups.map((group) => ({
    id: group.stageId,
    label: group.stageLabel,
    depth: group.stageDepth,
    hint: t("review_tailoring.matrix.rows_count", { count: group.rows.length }),
  }));

  const productCounts = useMemo(
    () => new Map(products.map((product) => [product.id, countCells(collectGroupCells(allGroups, product.id))])),
    [allGroups, products]
  );

  /** 有评审已经生成过（生效过的表）才有「评审状态」这一列 */
  const showReviewStatus = useMemo(() => items.some((item) => item.stage_review_id), [items]);
  const productSpan = showReviewStatus ? 3 : 2;

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const openItem = openReasonId ? itemById.get(openReasonId) : undefined;
  const openProduct = openItem ? productById.get(openItem.product_id) : undefined;

  const stageLeft = editable ? SELECT_WIDTH : 0;
  const reviewLeft = stageLeft + STAGE_WIDTH;
  const stickyHead = cn(PLAIN_TH, "sticky top-0 z-[6]");
  const columnCount = (editable ? 2 : 0) + 3 + products.length * productSpan;

  return (
    <>
      <table className={PLAIN_TABLE}>
        <thead>
          <tr>
            {editable && (
              <th
                rowSpan={2}
                data-row-head
                className={cn(stickyHead, "px-0 text-center")}
                style={{ ...fixedWidth(SELECT_WIDTH), left: 0 }}
              >
                <span className="grid place-items-center">
                  <ScopeCheckbox
                    cells={collectGroupCells(groups)}
                    selection={selection}
                    label={t("review_tailoring.matrix.select_all")}
                  />
                </span>
              </th>
            )}
            <th
              rowSpan={2}
              data-row-head
              className={cn(stickyHead, !editable && "pl-6")}
              style={{ ...fixedWidth(STAGE_WIDTH), left: stageLeft }}
            >
              <span className="flex items-center gap-1">
                <span className="truncate">{t("review_tailoring.matrix.stage_column")}</span>
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
              </span>
            </th>
            <th
              rowSpan={2}
              data-row-head
              className={cn(stickyHead, isScrolled && EDGE_SHADOW)}
              style={{ ...fixedWidth(REVIEW_WIDTH), left: reviewLeft }}
            >
              <span className="flex items-center">
                <span className="w-16 shrink-0 truncate">{t("review_tailoring.matrix.code_column")}</span>
                {t("review_tailoring.matrix.review_column")}
              </span>
            </th>
            <th rowSpan={2} className={cn(PLAIN_TH, "sticky top-0 z-[4]")} style={fixedWidth(88)}>
              {t("review_tailoring.matrix.type_column")}
            </th>
            {products.map((product) => {
              const counts = productCounts.get(product.id) ?? { kept: 0, cut: 0, missing: 0 };
              const columnCells = collectGroupCells(groups, product.id);
              return (
                <th
                  key={product.id}
                  colSpan={productSpan}
                  data-product-col
                  className={cn(PLAIN_TH, "sticky top-0 z-[4]")}
                  style={{ height: HEAD_ROW }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {/* 列头写开发编号：产品名往往很长，一屏摆不下几列；全名挂在 hover 上 */}
                    <Tooltip tooltipContent={product.name}>
                      <span className="min-w-0 truncate text-13 font-semibold text-primary">
                        {product.identifier || product.name}
                      </span>
                    </Tooltip>
                    <span className="shrink-0 font-normal tabular-nums">
                      {t("review_tailoring.matrix.summary", { kept: counts.kept, cut: counts.cut })}
                      {counts.missing > 0 && (
                        <span className="text-warning-primary">
                          {" · "}
                          {t("review_tailoring.matrix.summary_missing", { count: counts.missing })}
                        </span>
                      )}
                    </span>
                    {editable && (
                      <span className="ml-auto shrink-0">
                        <CustomMenu
                          customButton={
                            <span
                              title={t("review_tailoring.matrix.column_menu")}
                              className="grid size-6 place-items-center rounded text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
                            >
                              <ChevronDown className="size-3.5" />
                            </span>
                          }
                          placement="bottom-end"
                          closeOnSelect
                          // 挂到表格外：表头 sticky 会自建层叠，菜单留在格内会被滚动容器裁掉
                          portalElement={menuPortalEl}
                        >
                          <CustomMenu.MenuItem onClick={() => onSetColumn(columnCells, true)}>
                            {t("review_tailoring.matrix.keep_column")}
                          </CustomMenu.MenuItem>
                          <CustomMenu.MenuItem onClick={() => onSetColumn(columnCells, false)}>
                            {t("review_tailoring.matrix.cut_column")}
                          </CustomMenu.MenuItem>
                          <CustomMenu.MenuItem onClick={() => onRemoveProduct(product)} className="text-danger-primary">
                            {t("review_tailoring.matrix.remove_column")}
                          </CustomMenu.MenuItem>
                        </CustomMenu>
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
            {editable && (
              <th rowSpan={2} className={cn(PLAIN_TH, "sticky top-0 z-[4]")} style={fixedWidth(136)}>
                {t("review_tailoring.list.actions")}
              </th>
            )}
          </tr>
          <tr>
            {products.map((product) => {
              // 可编辑时右边还压着跨两行的「操作」列，这一行最后一格的右线不能省
              const subHead = cn(PLAIN_TH, "sticky z-[4]", editable && "last:border-r");
              const subStyle = { top: HEAD_ROW, height: HEAD_ROW };
              return [
                <th key={`${product.id}:result`} className={subHead} style={{ ...fixedWidth(96), ...subStyle }}>
                  {t("review_tailoring.matrix.result_column")}
                </th>,
                <th key={`${product.id}:reason`} className={cn(subHead, "min-w-[200px]")} style={subStyle}>
                  {t("review_tailoring.matrix.reason")}
                </th>,
                showReviewStatus && (
                  <th
                    key={`${product.id}:status`}
                    className={subHead}
                    style={{ ...fixedWidth(108), ...subStyle }}
                  >
                    {t("review_tailoring.matrix.review_status_column")}
                  </th>
                ),
              ];
            })}
          </tr>
        </thead>

        <tbody>
          {groups.length === 0 && emptyMessage && (
            <tr>
              <td colSpan={columnCount} className="border-b border-subtle px-6 py-10 text-13 text-tertiary">
                {emptyMessage}
              </td>
            </tr>
          )}
          {groups.flatMap((group) =>
            group.rows.map((row, index) => {
              const cells = [...row.cells.values()];
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
              const rowBg = isRowSelected ? "bg-accent-subtle" : "bg-surface-1 group-hover:bg-layer-1";
              // 只有评审活动行能挪；整行都已评审时按钮置灰并写明原因
              const canMoveRow = cells.some((cell) => getMoveBlockReason(cell) !== "move_not_activity");
              const movableCells = cells.filter((cell) => !getMoveBlockReason(cell));
              // 字重按类型分：挪出来的活动脱离了父评审成了顶层行，也还是活动的字重
              const isActivityRow = row.isChild || STAGE_REVIEW_ACTIVITY_KINDS.includes(row.kind as EStageReviewKind);
              // 格子全挪走、移动还没生效的原处：标题压淡，只剩「已移至」的空位（生效后这行由模型层藏掉）
              const isVacated = cells.length === 0 && row.movedOut.size > 0;
              return (
                <tr key={row.rowKey} className="group">
                  {editable && (
                    <td
                      className={cn(PLAIN_TD, "sticky z-[2] px-0", rowBg)}
                      style={{ ...fixedWidth(SELECT_WIDTH), left: 0 }}
                    >
                      <span className="grid place-items-center">
                        <ScopeCheckbox
                          cells={cells}
                          selection={selection}
                          label={t("review_tailoring.matrix.select_row")}
                        />
                      </span>
                    </td>
                  )}
                  <td
                    className={cn(PLAIN_TD, "sticky z-[2]", rowBg, !editable && "pl-6")}
                    style={{ ...fixedWidth(STAGE_WIDTH), left: stageLeft }}
                  >
                    <span
                      className="flex min-w-0 items-center gap-1.5"
                      style={group.stageDepth ? { paddingLeft: group.stageDepth * 12 } : undefined}
                    >
                      <span className="truncate" title={group.stageLabel}>
                        {group.stageLabel}
                      </span>
                      {/* 从别的阶段挪进来的行：原阶段跟在后面，悬停看全句 */}
                      {row.originStageLabel && (
                        <Tooltip
                          tooltipContent={t("review_tailoring.move_stage.moved_from_tooltip", {
                            stage: row.originStageLabel,
                          })}
                        >
                          <span className="shrink-0 text-12 text-placeholder">
                            {t("review_tailoring.move_stage.moved_from", { stage: row.originStageLabel })}
                          </span>
                        </Tooltip>
                      )}
                    </span>
                  </td>
                  <td
                    className={cn(PLAIN_TD, "sticky z-[2]", rowBg, isScrolled && EDGE_SHADOW)}
                    style={{ ...fixedWidth(REVIEW_WIDTH), left: reviewLeft }}
                  >
                    <span className="flex min-w-0 items-center">
                      <span
                        className={cn(CODE_CLASS, !isActivityRow ? "font-medium text-primary" : "text-tertiary")}
                        title={row.standardCode || undefined}
                      >
                        {row.standardCode}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 truncate",
                          row.isChild && "pl-5",
                          !isActivityRow && "font-semibold",
                          isVacated && "text-tertiary"
                        )}
                        title={row.title}
                      >
                        {rest}
                      </span>
                    </span>
                  </td>
                  <td className={cn(PLAIN_TD, "whitespace-nowrap", rowBg)}>
                    <StageReviewKindBadge kind={row.kind as EStageReviewKind} />
                  </td>

                  {products.map((product) => {
                    const cell = row.cells.get(product.id);
                    if (!cell) {
                      // 这一格的活动挪去了别的阶段：原处留空位，写清去了哪
                      const movedTo = row.movedOut.get(product.id);
                      return (
                        <td
                          key={product.id}
                          colSpan={productSpan}
                          className={cn(PLAIN_TD, "bg-layer-1 text-12 whitespace-nowrap text-placeholder")}
                        >
                          {movedTo &&
                            `${t("review_tailoring.move_stage.moved_to_prefix")} ${movedTo.stage_label}`}
                        </td>
                      );
                    }
                    const reason = cell.reason.trim();
                    const keepLock = cell.selected ? null : getCellLockReason(cell, true);
                    const cellBg = rowBg;
                    return [
                      <td key={`${product.id}:result`} className={cn(PLAIN_TD, "relative", cellBg)}>
                        {editable ? (
                          <ResultSelect
                            value={cell.selected}
                            keepLockReason={keepLock ? t(`review_tailoring.matrix.${keepLock}`) : null}
                            onChange={(keep) => onToggle(cell.id, keep)}
                          />
                        ) : (
                          <ResultText value={cell.selected} />
                        )}
                        {/* 有未保存的改动：右上角一个小点，与底部「N 处改动未保存」数的是同一批 */}
                        {dirtyIds.has(cell.id) && (
                          <span
                            className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent-primary"
                            aria-hidden
                          />
                        )}
                      </td>,
                      <td key={`${product.id}:reason`} className={cn(PLAIN_TD, "max-w-0 min-w-[200px]", cellBg)}>
                        {cell.selected ? (
                          <span className="text-placeholder">—</span>
                        ) : reason ? (
                          <button
                            type="button"
                            className="block w-full truncate text-left text-secondary hover:text-primary"
                            title={reason}
                            onClick={() => setOpenReasonId(cell.id)}
                          >
                            {reason}
                          </button>
                        ) : editable ? (
                          <button
                            type="button"
                            className="font-medium whitespace-nowrap text-warning-primary hover:underline"
                            onClick={() => setOpenReasonId(cell.id)}
                          >
                            {t("review_tailoring.matrix.write_reason")}
                          </button>
                        ) : (
                          <span className="text-placeholder">{t("review_tailoring.matrix.reason_missing")}</span>
                        )}
                      </td>,
                      showReviewStatus && (
                        <td key={`${product.id}:status`} className={cn(PLAIN_TD, "whitespace-nowrap", cellBg)}>
                          {cell.stage_review_id && cell.stage_review_status ? (
                            <span className="flex items-center gap-1.5 text-secondary">
                              <span
                                className={cn(
                                  "size-1.5 shrink-0 rounded-full bg-current",
                                  REVIEW_STATUS_TONE[cell.stage_review_status] ?? REVIEW_STATUS_TONE.not_started
                                )}
                              />
                              {t(`stage_review.status.${cell.stage_review_status}`)}
                              {isCompletedCut(cell) && (
                                <Tooltip tooltipContent={t("review_tailoring.matrix.completed_will_delete")}>
                                  <span className="flex shrink-0 items-center text-danger-primary">
                                    <AlertTriangle className="size-3.5" strokeWidth={2.4} />
                                  </span>
                                </Tooltip>
                              )}
                            </span>
                          ) : (
                            <span className="text-placeholder">—</span>
                          )}
                        </td>
                      ),
                    ];
                  })}

                  {editable && (
                    <td className={cn(PLAIN_TD, rowBg)}>
                      <span className="flex items-center gap-3.5">
                        {canMoveRow && (
                          <button
                            type="button"
                            className={PLAIN_ACTION}
                            disabled={movableCells.length === 0}
                            title={
                              movableCells.length === 0
                                ? t("review_tailoring.move_stage.blocked_completed")
                                : undefined
                            }
                            onClick={() => onMoveCells(movableCells)}
                          >
                            {t("review_tailoring.move_stage.bulk")}
                          </button>
                        )}
                        <button type="button" className={PLAIN_ACTION_DANGER} onClick={() => onRemoveReview(row)}>
                          {t("review_tailoring.matrix.remove_row")}
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <CellReasonModal
        isOpen={Boolean(openItem)}
        value={openItem?.reason ?? ""}
        context={
          openItem
            ? {
                title: openItem.title,
                stage: openItem.stage_label,
                product: openProduct?.identifier || openProduct?.name || "",
              }
            : undefined
        }
        editable={editable}
        onSave={(reason) => {
          if (openItem) onReasonChange(openItem.id, reason);
        }}
        onClose={() => setOpenReasonId(null)}
      />
    </>
  );
};
