import { useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@plane/propel/table";
import type { TReviewTailoringItem, TReviewTailoringProduct } from "@plane/types";
import { cn, renderFormattedDateTime } from "@plane/utils";
import { ResizableTableHead, useColumnWidths } from "@/components/common/resizable-table-head";
import { TableSelectCheckbox } from "@/components/common/table-select-checkbox";
import { CellReasonModal } from "./cell-reason-modal";
import { ResultSelect, ResultText } from "./result-select";
import { getCellLockReason } from "./tailoring-matrix-model";
import type { TCellSelection } from "./use-cell-selection";

/** 明细按裁剪结果筛：全部 / 只看保留 / 只看裁剪 */
export type TItemResultFilter = "all" | "kept" | "cut";

/** 列宽默认值。「裁剪原因」不在表里 —— 它吃掉剩余宽度，所以右边不会留白 */
const DEFAULT_WIDTHS: Record<string, number> = {
  // 序号列的左内边距里还要放悬停才出现的勾选框
  index: 84,
  product: 150,
  // 挪过阶段的行在阶段后面带「自 X」，留出它的宽度
  stage: 160,
  kind: 108,
  standard_code: 112,
  name: 280,
  tailored: 104,
  created_by: 104,
  // 末列多一截右边距（页面留白），日期要在它之外还放得下
  created_at: 136,
};

/** 评审名称拖窄到认不出就没意义了，给它一个更大的下限 */
const MIN_WIDTHS: Record<string, number> = { name: 160 };

const COLUMNS = [
  "index",
  "product",
  "stage",
  "kind",
  "standard_code",
  "name",
  "tailored",
  "reason",
  "created_by",
  "created_at",
] as const;

/**
 * 表格满宽铺开，跟裁剪矩阵一个口径：不套卡片、左右不留内边距，只画格线。
 * 最后一列不画右线 —— 那条线会正好压在内容区边缘上。
 */
const GRID_TABLE_CLASS =
  "[&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0 [&_th:last-child]:pr-6 [&_td:last-child]:pr-6";

/**
 * 明细里看得见的那批行：按 Tab 条上的产品与裁剪结果筛选，再按
 * 「产品 → 阶段 → 模板顺序」排，读起来是「这个产品每个阶段要做什么」。
 *
 * 页面也要这一批：底部操作条的「选择全部」与表头三态勾选算的都是它。
 */
export const buildItemRows = (
  items: TReviewTailoringItem[],
  products: TReviewTailoringProduct[],
  productFilter: string,
  resultFilter: TItemResultFilter = "all"
) => {
  const nameOf = new Map(products.map((product) => [product.id, product.name]));
  const rows = items.filter(
    (item) =>
      (productFilter === "all" || item.product_id === productFilter) &&
      (resultFilter === "all" || item.selected === (resultFilter === "kept"))
  );
  return [...rows].sort((a, b) => {
    const left = nameOf.get(a.product_id) ?? "";
    const right = nameOf.get(b.product_id) ?? "";
    if (left !== right) return left.localeCompare(right);
    if (a.stage_sort_order !== b.stage_sort_order) return a.stage_sort_order - b.stage_sort_order;
    return a.template_sort_order - b.template_sort_order;
  });
};

/**
 * 裁剪明细：把矩阵摊平成一行一格，字段与原始裁剪表一致（序号 / 产品 / 阶段 / 评审类型 /
 * 评审名称 / 是否裁剪 / 裁剪原因 / 创建人 / 创建时间）。
 *
 * 表格照用例列表那一套：格线表头、列宽可拖、行首悬停勾选。勾中的行由页面底部的
 * 批量操作条统一处理（保留 / 裁剪 / 填写原因）—— 选中的单位就是格子 id，与矩阵共用一份。
 *
 * 矩阵适合一片一片地改，明细适合逐条读和逐条改 —— 两边用的是同一套控件（「保留 / 裁剪」
 * 下拉 + 原因大弹窗），改的也是同一份本地格子，所以在哪边改都算同一批未保存改动。
 */
export const TailoringItemsTable = ({
  rows,
  products,
  editable,
  dirtyIds,
  selection,
  onToggle,
  onReasonChange,
}: {
  /** 当前筛选下要画的行，由页面用 `buildItemRows` 算好 */
  rows: TReviewTailoringItem[];
  products: TReviewTailoringProduct[];
  editable: boolean;
  /** 与服务端有差异的格子：行首画一道蓝线 */
  dirtyIds: Set<string>;
  /** 行选中，由页面持有：底部批量操作条要读它 */
  selection: TCellSelection;
  onToggle: (itemId: string, selected: boolean) => void;
  onReasonChange: (itemId: string, reason: string) => void;
}) => {
  const { t } = useTranslation();
  const [openReasonId, setOpenReasonId] = useState<string | null>(null);
  const { setWidth, widthOf } = useColumnWidths(DEFAULT_WIDTHS);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const openItem = openReasonId ? rows.find((item) => item.id === openReasonId) : undefined;
  const headerState = selection.stateOf(rows);
  const hasSelection = selection.selectedIds.size > 0;

  return (
    <>
      <Table
        className={cn("min-w-[1352px] table-fixed border-separate border-spacing-0", GRID_TABLE_CLASS)}
        // 让页面那层滚动容器接管横向滚动：它才带可见的滚动条，表头也才能真的 sticky
        wrapperClassName="overflow-visible"
      >
        <colgroup>
          {COLUMNS.map((key) => (
            // 「裁剪原因」不给宽度：定宽列之外的剩余宽度都归它
            <col key={key} style={key === "reason" ? undefined : { width: widthOf(key) }} />
          ))}
        </colgroup>
        <TableHeader className="sticky top-0 z-[2] bg-layer-1">
          <TableRow>
            {COLUMNS.map((key, index) => (
              <ResizableTableHead
                key={key}
                className="bg-layer-1"
                selectHost={index === 0}
                minWidth={MIN_WIDTHS[key]}
                // 序号列与吃剩余宽度的那一列不给拖
                onResize={key === "reason" || key === "index" ? undefined : (width) => setWidth(key, width)}
              >
                {index === 0 && editable && (
                  <TableSelectCheckbox
                    hoverGroup="header"
                    checked={headerState === "all"}
                    indeterminate={headerState === "some"}
                    forceVisible={hasSelection}
                    label={t("review_tailoring.items.select_all_rows")}
                    onChange={() => selection.toggle(rows)}
                  />
                )}
                <span className="truncate">{t(`review_tailoring.items.${key}`)}</span>
              </ResizableTableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={COLUMNS.length}
                className="border-r border-b border-subtle px-3 py-8 text-center text-secondary"
              >
                {t("review_tailoring.items.empty")}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((item, rowIndex) => {
              const reason = item.reason.trim();
              const keepLock = item.selected ? null : getCellLockReason(item, true);
              const isPicked = selection.selectedIds.has(item.id);
              const cellClass = "h-11 border-r border-b border-subtle px-3 py-0 align-middle text-13 text-primary";
              // 产品 / 阶段 / 创建人 / 时间是定位信息，压一档颜色，让评审名称先被读到
              const metaClass = cn(cellClass, "truncate text-secondary");
              return (
                <TableRow
                  key={item.id}
                  className={cn("group", isPicked ? "bg-accent-subtle" : "bg-surface-1 hover:bg-layer-1")}
                >
                  <TableCell
                    className={cn(
                      metaClass,
                      "relative pr-3 pl-10 tabular-nums",
                      // 有未保存改动的行，行首一道蓝线（与矩阵格子的小蓝点同义）
                      dirtyIds.has(item.id) && "shadow-[inset_3px_0_0_var(--bg-accent-primary)]"
                    )}
                  >
                    {editable && (
                      <TableSelectCheckbox
                        hoverGroup="row"
                        checked={isPicked}
                        forceVisible={hasSelection}
                        label={t("review_tailoring.items.select_row")}
                        onChange={() => selection.toggle([item])}
                      />
                    )}
                    {rowIndex + 1}
                  </TableCell>
                  <TableCell className={metaClass}>{productById.get(item.product_id)?.name ?? "—"}</TableCell>
                  <TableCell className={metaClass}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{item.stage_label}</span>
                      {item.origin_stage_label && (
                        <Tooltip
                          tooltipContent={t("review_tailoring.move_stage.moved_from_tooltip", {
                            stage: item.origin_stage_label,
                          })}
                        >
                          <span className="shrink-0 text-12 text-placeholder">
                            {t("review_tailoring.move_stage.moved_from", { stage: item.origin_stage_label })}
                          </span>
                        </Tooltip>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className={metaClass}>{t(`workspace_templates.reviews.kind.${item.kind}`)}</TableCell>
                  <TableCell
                    className={cn(cellClass, "truncate font-mono tabular-nums text-secondary")}
                    title={item.standard_code}
                  >
                    {item.standard_code}
                  </TableCell>
                  <TableCell className={cn(cellClass, "truncate")} title={item.title}>
                    {item.title}
                  </TableCell>
                  <TableCell className={cn(cellClass, "whitespace-nowrap")}>
                    {editable ? (
                      <ResultSelect
                        value={item.selected}
                        keepLockReason={keepLock ? t(`review_tailoring.matrix.${keepLock}`) : null}
                        onChange={(keep) => onToggle(item.id, keep)}
                      />
                    ) : (
                      <ResultText value={item.selected} />
                    )}
                  </TableCell>
                  <TableCell className={cellClass}>
                    {item.selected ? (
                      <span className="text-placeholder">—</span>
                    ) : reason ? (
                      <button
                        type="button"
                        className="block w-full truncate text-left text-secondary hover:text-primary"
                        title={reason}
                        onClick={() => setOpenReasonId(item.id)}
                      >
                        {reason}
                      </button>
                    ) : editable ? (
                      <button
                        type="button"
                        className="font-medium whitespace-nowrap text-warning-primary hover:underline"
                        onClick={() => setOpenReasonId(item.id)}
                      >
                        {t("review_tailoring.matrix.write_reason")}
                      </button>
                    ) : (
                      <span className="text-placeholder">{t("review_tailoring.matrix.reason_missing")}</span>
                    )}
                  </TableCell>
                  <TableCell className={metaClass}>{item.created_by_detail?.display_name ?? "—"}</TableCell>
                  <TableCell className={cn(metaClass, "tabular-nums")}>
                    {/* 按本地时区取日期，写成 2026-09-15，与整页中文口径一致 */}
                    {renderFormattedDateTime(item.created_at).slice(0, 10) || "—"}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <CellReasonModal
        isOpen={Boolean(openItem)}
        value={openItem?.reason ?? ""}
        // 明细里一屏一百多条，不说清是哪一条容易改错行
        context={
          openItem
            ? {
                title: openItem.title,
                stage: openItem.stage_label,
                product: productById.get(openItem.product_id)?.name ?? "",
              }
            : undefined
        }
        editable={editable}
        onSave={(next) => {
          if (openItem) onReasonChange(openItem.id, next);
        }}
        onClose={() => setOpenReasonId(null)}
      />
    </>
  );
};
