import { useMemo, useState } from "react";
import { AlertTriangle, MessageSquare, Pencil } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@plane/propel/table";
import type { TReviewTailoringItem, TReviewTailoringProduct } from "@plane/types";
import { cn, renderFormattedDateTime } from "@plane/utils";
import { ResizableTableHead, useColumnWidths } from "@/components/common/resizable-table-head";
import { TableSelectCheckbox } from "@/components/common/table-select-checkbox";
import { StageReviewKindBadge } from "@/components/template-management/reviews/stage-review-kind-badge";
import { CellReasonModal } from "./cell-reason-modal";
import { KeepCutSegment } from "./keep-cut-segment";
import { MovedFromBadge } from "./moved-from-badge";
import { getCellLockReason } from "./tailoring-matrix-model";
import type { TCellSelection } from "./use-cell-selection";

/** 列宽默认值。「裁剪原因」不在表里 —— 它吃掉剩余宽度，所以右边不会留白 */
const DEFAULT_WIDTHS: Record<string, number> = {
  product: 176,
  // 挪过阶段的行在阶段后面带「自 X」徽章，留出它的宽度
  stage: 168,
  kind: 108,
  name: 250,
  tailored: 158,
  created_by: 96,
  // 末列多一截右边距（页面留白），日期要在它之外还放得下
  created_at: 144,
};

/** 评审名称拖窄到认不出就没意义了，给它一个更大的下限 */
const MIN_WIDTHS: Record<string, number> = { name: 160 };

const COLUMNS = ["product", "stage", "kind", "name", "tailored", "reason", "created_by", "created_at"] as const;

/**
 * 表格满宽铺开，跟裁剪矩阵一个口径：不套卡片、左右不留内边距，只画格线。
 * 最后一列不画右线 —— 那条线会正好压在内容区边缘上。
 */
const GRID_TABLE_CLASS =
  "[&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0 [&_th:last-child]:pr-6 [&_td:last-child]:pr-6";

/**
 * 明细里看得见的那批行：按 Tab 条上的产品筛选，再按
 * 「产品 → 阶段 → 模板顺序」排，读起来是「这个产品每个阶段要做什么」。
 *
 * 页面也要这一批：底部操作条的「选择全部」与表头三态勾选算的都是它。
 */
export const buildItemRows = (
  items: TReviewTailoringItem[],
  products: TReviewTailoringProduct[],
  productFilter: string
) => {
  const nameOf = new Map(products.map((product) => [product.id, product.name]));
  const rows = items.filter((item) => productFilter === "all" || item.product_id === productFilter);
  return [...rows].sort((a, b) => {
    const left = nameOf.get(a.product_id) ?? "";
    const right = nameOf.get(b.product_id) ?? "";
    if (left !== right) return left.localeCompare(right);
    if (a.stage_sort_order !== b.stage_sort_order) return a.stage_sort_order - b.stage_sort_order;
    return a.template_sort_order - b.template_sort_order;
  });
};

/**
 * 裁剪明细：把矩阵摊平成一行一格，字段与原始裁剪表一致（产品 / 阶段 / 评审类型 /
 * 评审名称 / 是否裁剪 / 裁剪原因 / 创建人 / 创建时间）。
 *
 * 表格照用例列表那一套：格线表头、列宽可拖、行首悬停勾选。勾中的行由页面底部的
 * 批量操作条统一处理（保留 / 裁剪 / 填写原因）—— 选中的单位就是格子 id，与矩阵共用一份。
 *
 * 矩阵适合一片一片地勾，明细适合逐条读和逐条改 —— 两边用的是同一套控件（「保留 | 裁剪」
 * 两段式 + 原因大弹窗），改的也是同一份本地格子，所以在哪边改都算同一批未保存改动。
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
        className={cn("min-w-[1180px] table-fixed border-separate border-spacing-0", GRID_TABLE_CLASS)}
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
                // 最后一列与吃剩余宽度的那一列不给拖，拖了也只是把表撑宽
                onResize={key === "reason" ? undefined : (width) => setWidth(key, width)}
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
              <TableCell colSpan={COLUMNS.length} className="border-r border-b border-subtle px-3 py-8 text-center text-secondary">
                {t("review_tailoring.items.empty")}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((item) => {
              const reason = item.reason.trim();
              const isMissing = !item.selected && !reason;
              const keepLock = item.selected ? null : getCellLockReason(item, true);
              const isPicked = selection.selectedIds.has(item.id);
              const cellClass = "h-12 border-r border-b border-subtle px-3 py-0 align-middle text-14 text-primary";
              // 产品 / 阶段 / 创建人 / 时间是定位信息，压一档颜色，让评审名称先被读到
              const metaClass = cn(cellClass, "truncate text-secondary");
              return (
                <TableRow
                  key={item.id}
                  className={cn(
                    "group",
                    // 一张表可能整屏都是裁剪项，再给裁剪行铺灰底会把整个表面染灰、
                    // 连表头都分不出来 —— 状态交给「保留 | 裁剪」和原因列去表达
                    isPicked ? "bg-accent-subtle" : "bg-surface-1",
                    !isPicked && "hover:bg-layer-1"
                  )}
                >
                  <TableCell
                    className={cn(
                      metaClass,
                      "relative pr-3 pl-10",
                      // 有未保存改动的行，行首一道蓝线（与矩阵格子的蓝角标同义）
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
                    {productById.get(item.product_id)?.name ?? "—"}
                  </TableCell>
                  <TableCell className={metaClass}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{item.stage_label}</span>
                      {item.origin_stage_label && <MovedFromBadge stage={item.origin_stage_label} />}
                    </span>
                  </TableCell>
                  <TableCell className={cellClass}>
                    <StageReviewKindBadge
                      kind={item.kind as never}
                      // 活动徽章默认就是 layer-1 底，和裁剪行的底色同色会看不见，压深一档
                      className={item.kind === "activity" ? "bg-layer-3 text-secondary" : undefined}
                    />
                  </TableCell>
                  <TableCell className={cn(cellClass, "truncate")} title={item.title}>
                    {item.title}
                  </TableCell>
                  <TableCell className={cn(cellClass, "whitespace-nowrap")}>
                    <KeepCutSegment
                      value={item.selected}
                      editable={editable}
                      keepLockReason={keepLock ? t(`review_tailoring.matrix.${keepLock}`) : null}
                      onChange={(keep) => onToggle(item.id, keep)}
                    />
                  </TableCell>
                  <TableCell className={cellClass}>
                    {!item.selected ? (
                      reason || editable ? (
                        <button
                          type="button"
                          className={cn(
                            "group/reason flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-14 transition-colors",
                            editable && "hover:bg-layer-transparent-hover",
                            isMissing ? "font-medium text-warning-primary" : "text-secondary"
                          )}
                          title={reason || undefined}
                          disabled={!editable && !reason}
                          onClick={() => setOpenReasonId(item.id)}
                        >
                          {isMissing ? (
                            <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2.4} />
                          ) : (
                            <MessageSquare className="size-3.5 shrink-0 text-placeholder" />
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            {reason || t("review_tailoring.matrix.write_reason")}
                          </span>
                          {editable && (
                            <Pencil className="size-3.5 shrink-0 text-tertiary opacity-0 transition-opacity group-hover/reason:opacity-100" />
                          )}
                        </button>
                      ) : (
                        <span className="text-12 text-placeholder">{t("review_tailoring.matrix.reason_missing")}</span>
                      )
                    ) : (
                      <span className="text-tertiary">—</span>
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
        subtitle={
          openItem
            ? [productById.get(openItem.product_id)?.name, openItem.stage_label, openItem.title]
                .filter(Boolean)
                .join(" · ")
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
