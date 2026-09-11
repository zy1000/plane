import { Fragment, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, MessageSquareText, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { Tooltip } from "@plane/propel/tooltip";
import type { TReviewTailoringItem, TReviewTailoringProduct, TReviewTailoringRow } from "@plane/types";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";
import { StageReviewKindBadge } from "@/components/template-management/reviews/stage-review-kind-badge";
import { CellReasonPopover } from "./cell-reason-popover";
import { buildMatrixGroups, getCellLockReason, getGroupSelectionCount, getRowSelectionState } from "./tailoring-matrix-model";

/**
 * 二维裁剪矩阵：纵轴是挑进来的评审（按阶段分段，评审活动缩进在它所属的评审下），
 * 横轴是挑进来的产品。
 *
 * 两个轴都是人加出来的 —— 没加进来的评审不出现在表里，也就不必为它写裁剪原因。
 * 首列与表头都 sticky —— 产品多了要横滚，滚动时必须还能看见「这一行是哪个评审」。
 * 分组行可折叠；行列的移除按钮 hover 才出，免得跟勾选抢注意力。
 * 写法参考 qa/review/review-case-detail-table.tsx。
 */
export const TailoringMatrix = ({
  rows,
  items,
  products,
  editable,
  onToggle,
  onReasonChange,
  onRemoveReview,
  onRemoveProduct,
}: {
  rows: TReviewTailoringRow[];
  items: TReviewTailoringItem[];
  products: TReviewTailoringProduct[];
  editable: boolean;
  onToggle: (itemId: string, selected: boolean) => void;
  onReasonChange: (itemId: string, reason: string) => void;
  onRemoveReview: (templateId: string, title: string) => void;
  onRemoveProduct: (productId: string, name: string) => void;
}) => {
  const { t } = useTranslation();
  const [openReasonFor, setOpenReasonFor] = useState<string | null>(null);
  /** 收起的阶段。默认全展开 —— 建表后第一次进来应该看得见全貌 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const groups = buildMatrixGroups(rows, items);

  if (groups.length === 0) return null;

  const toggleGroup = (stageId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });

  return (
    <Table
      className="min-w-full table-fixed border-separate border-spacing-0 border-t border-l border-subtle"
      wrapperClassName="max-h-[60vh] overflow-auto"
    >
      <TableHeader className="sticky top-0 z-[3] bg-layer-1">
        <TableRow>
          <TableHead className="sticky left-0 z-[4] w-[320px] min-w-[320px] border-r border-b border-subtle bg-layer-1 px-3 py-2 text-left">
            {t("review_tailoring.matrix.review_column")}
          </TableHead>
          {products.map((product) => (
            <TableHead
              key={product.id}
              className="group/col w-[160px] min-w-[160px] border-r border-b border-subtle px-3 py-2 text-left align-bottom"
            >
              <div className="flex items-end gap-1">
                <Tooltip tooltipContent={`${product.name}${product.code ? ` · ${product.code}` : ""}`}>
                  <div className="min-w-0 flex-1 truncate">
                    <p className="truncate text-12 font-medium text-primary">{product.name}</p>
                    {product.code && <p className="truncate text-10 text-tertiary">{product.code}</p>}
                  </div>
                </Tooltip>
                {editable && (
                  <button
                    type="button"
                    title={t("review_tailoring.matrix.remove_product")}
                    className="shrink-0 rounded p-0.5 text-tertiary opacity-0 transition group-hover/col:opacity-100 hover:bg-layer-2 hover:text-danger-primary"
                    onClick={() => onRemoveProduct(product.id, product.name)}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>

      <TableBody>
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.stageId);
          const { selected, total } = getGroupSelectionCount(group);
          return (
            <Fragment key={group.stageId}>
              {/* 分组行：整行一格，首列位置 sticky，横滚时阶段名不跟着跑 */}
              <TableRow className="bg-layer-1">
                <TableCell
                  colSpan={products.length + 1}
                  className="border-r border-b border-subtle p-0"
                >
                  <button
                    type="button"
                    className="sticky left-0 flex w-[320px] min-w-[320px] items-center gap-1.5 px-3 py-1.5 text-left"
                    onClick={() => toggleGroup(group.stageId)}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="size-3.5 shrink-0 text-tertiary" />
                    ) : (
                      <ChevronDown className="size-3.5 shrink-0 text-tertiary" />
                    )}
                    <span className="truncate text-12 font-semibold text-primary">{group.stageLabel}</span>
                    <span className="shrink-0 text-10 text-tertiary tabular-nums">
                      {t("review_tailoring.matrix.stage_selected", { selected, total })}
                    </span>
                  </button>
                </TableCell>
              </TableRow>

              {!isCollapsed &&
                group.rows.map((row) => {
                  const selectionState = getRowSelectionState(row);
                  return (
                    <TableRow key={row.templateId} className="group bg-surface-1 hover:bg-surface-2">
                      <TableCell
                        className={cn(
                          "sticky left-0 z-[2] w-[320px] min-w-[320px] border-r border-b border-subtle bg-surface-1 px-3 py-2 align-top",
                          "group-hover:bg-surface-2"
                        )}
                      >
                        <div className={cn("flex items-start gap-2", row.isChild && "pl-5")}>
                          {/* 子行画一小段连接线，缩进之外再给一个视觉锚点 */}
                          {row.isChild && (
                            <span className="mt-2 -ml-3 h-px w-2.5 shrink-0 bg-subtle" aria-hidden />
                          )}
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "truncate text-13 text-primary",
                                !row.isChild && "font-medium"
                              )}
                              title={row.title}
                            >
                              {row.title}
                            </p>
                            <div className="mt-1 flex items-center gap-1.5">
                              <StageReviewKindBadge kind={row.kind as never} />
                              {selectionState === "some" && (
                                <span className="text-10 text-tertiary">
                                  {t("review_tailoring.list.selected")}
                                  {" "}
                                  {[...row.cells.values()].filter((cell) => cell.selected).length}/{row.cells.size}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* 纵轴按顶层评审整块加减，所以评审活动那一行不给移除入口 */}
                          {editable && !row.isChild && (
                            <button
                              type="button"
                              title={t("review_tailoring.matrix.remove_review")}
                              className="shrink-0 rounded p-0.5 text-tertiary opacity-0 transition group-hover:opacity-100 hover:bg-layer-2 hover:text-danger-primary"
                              onClick={() => onRemoveReview(row.templateId, row.title)}
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </div>
                      </TableCell>

                      {products.map((product) => {
                        const cell = row.cells.get(product.id);
                        if (!cell) {
                          return (
                            <TableCell
                              key={product.id}
                              className="w-[160px] min-w-[160px] border-r border-b border-subtle bg-layer-1/40 px-3 py-2"
                            />
                          );
                        }
                        const lockOnUncheck = getCellLockReason(cell, false);
                        const lockOnCheck = getCellLockReason(cell, true);
                        const lock = cell.selected ? lockOnUncheck : lockOnCheck;
                        const disabled = !editable || Boolean(lock);
                        const missingReason = !cell.selected && !cell.reason.trim();

                        return (
                          <TableCell
                            key={product.id}
                            className="relative w-[160px] min-w-[160px] border-r border-b border-subtle px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <Tooltip
                                tooltipContent={lock ? t(`review_tailoring.matrix.${lock}`) : ""}
                                disabled={!lock}
                              >
                                <span className="flex items-center">
                                  <Checkbox
                                    checked={cell.selected}
                                    disabled={disabled}
                                    onChange={(event) => onToggle(cell.id, event.target.checked)}
                                  />
                                </span>
                              </Tooltip>

                              {/* 已生成评审的格子给一个小圆点，hover 出评审状态 */}
                              {cell.stage_review_id && (
                                <Tooltip tooltipContent={t("review_tailoring.matrix.generated")}>
                                  <span className="size-1.5 shrink-0 rounded-full bg-success-primary" />
                                </Tooltip>
                              )}

                              {!cell.selected && (
                                <button
                                  type="button"
                                  className={cn(
                                    "ml-auto flex items-center rounded p-0.5 transition-colors",
                                    missingReason
                                      ? "text-warning-primary hover:bg-warning-subtle"
                                      : "text-tertiary hover:bg-layer-2 hover:text-secondary"
                                  )}
                                  title={
                                    missingReason
                                      ? t("review_tailoring.matrix.reason_missing")
                                      : t("review_tailoring.matrix.reason")
                                  }
                                  onClick={() => setOpenReasonFor(openReasonFor === cell.id ? null : cell.id)}
                                >
                                  {missingReason ? (
                                    <AlertCircle className="size-3.5" />
                                  ) : (
                                    <MessageSquareText className="size-3.5" />
                                  )}
                                </button>
                              )}
                            </div>

                            {openReasonFor === cell.id && (
                              <CellReasonPopover
                                value={cell.reason}
                                editable={editable}
                                onSave={(reason) => onReasonChange(cell.id, reason)}
                                onClose={() => setOpenReasonFor(null)}
                              />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
};
