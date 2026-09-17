import { useMemo, useState } from "react";
import { AlertTriangle, MessageSquare, Pencil } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import type { TReviewTailoringItem, TReviewTailoringProduct } from "@plane/types";
import { cn, renderFormattedDateTime } from "@plane/utils";
import { StageReviewKindBadge } from "@/components/template-management/reviews/stage-review-kind-badge";
import type { TBulkReasonScope } from "./bulk-reason-modal";
import { BulkReasonModal } from "./bulk-reason-modal";
import { CellReasonModal } from "./cell-reason-modal";
import { KeepCutSegment } from "./keep-cut-segment";
import { collectMissingReasons, getCellLockReason } from "./tailoring-matrix-model";

/**
 * 裁剪明细：把矩阵摊平成一行一格，字段与原始裁剪表一致（产品 / 阶段 / 评审类型 /
 * 评审名称 / 是否裁剪 / 裁剪原因 / 创建人 / 创建时间）。
 *
 * 矩阵适合一片一片地勾，明细适合逐条读和逐条改 —— 两边用的是同一套控件（「保留 | 裁剪」
 * 两段式 + 原因大弹窗），改的也是同一份本地格子，所以在哪边改都算同一批未保存改动。
 */
export const TailoringItemsTable = ({
  items,
  products,
  productFilter,
  onlyMissing,
  editable,
  dirtyIds,
  onToggle,
  onReasonChange,
  onBulkReason,
}: {
  items: TReviewTailoringItem[];
  products: TReviewTailoringProduct[];
  /** 产品筛选在 Tab 条右上角，这里只消费 */
  productFilter: string;
  /** 只看待补原因，同样来自 Tab 条 */
  onlyMissing: boolean;
  editable: boolean;
  /** 与服务端有差异的格子：行首画一道蓝线 */
  dirtyIds: Set<string>;
  onToggle: (itemId: string, selected: boolean) => void;
  onReasonChange: (itemId: string, reason: string) => void;
  onBulkReason: (itemIds: string[], reason: string) => void;
}) => {
  const { t } = useTranslation();
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [openReasonId, setOpenReasonId] = useState<string | null>(null);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const missing = useMemo(() => collectMissingReasons(items), [items]);

  const visible = useMemo(() => {
    const rows = items.filter(
      (item) =>
        (productFilter === "all" || item.product_id === productFilter) &&
        (!onlyMissing || (!item.selected && !item.reason.trim()))
    );
    // 先按产品、再按阶段、最后按模板顺序，读起来是「这个产品每个阶段要做什么」
    return [...rows].sort((a, b) => {
      const left = productById.get(a.product_id)?.name ?? "";
      const right = productById.get(b.product_id)?.name ?? "";
      if (left !== right) return left.localeCompare(right);
      if (a.stage_sort_order !== b.stage_sort_order) return a.stage_sort_order - b.stage_sort_order;
      return a.template_sort_order - b.template_sort_order;
    });
  }, [items, productFilter, onlyMissing, productById]);

  const openItem = openReasonId ? items.find((item) => item.id === openReasonId) : undefined;
  /** 「当前筛选下的裁剪项」批量范围：看得见的那批裁剪格子 */
  const visibleCut = useMemo(() => visible.filter((item) => !item.selected), [visible]);

  const applyBulk = (scope: TBulkReasonScope, reason: string) => {
    const targets = scope === "missing" ? missing : visibleCut;
    onBulkReason(
      targets.map((item) => item.id),
      reason
    );
  };

  return (
    <div className="space-y-3">
      {editable && (missing.length > 0 || visibleCut.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setIsBulkOpen(true)}>
            {t("review_tailoring.items.bulk_reason")}
          </Button>
        </div>
      )}

      <Table className="min-w-full border-separate border-spacing-0 border-t border-l border-subtle">
        <TableHeader className="sticky top-0 z-[2] bg-layer-1">
          <TableRow>
            {[
              "product",
              "stage",
              "kind",
              "name",
              "tailored",
              "reason",
              "created_by",
              "created_at",
            ].map((key) => (
              <TableHead key={key} className="border-r border-b border-subtle px-3 py-2 text-left whitespace-nowrap">
                {t(`review_tailoring.items.${key}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="border-r border-b border-subtle px-3 py-8 text-center text-secondary">
                {t("review_tailoring.items.empty")}
              </TableCell>
            </TableRow>
          ) : (
            visible.map((item) => {
              const reason = item.reason.trim();
              const isMissing = !item.selected && !reason;
              const keepLock = item.selected ? null : getCellLockReason(item, true);
              return (
                <TableRow key={item.id} className={cn(item.selected ? "bg-surface-1" : "bg-layer-1", "hover:bg-surface-2")}>
                  <TableCell
                    className={cn(
                      "border-r border-b border-subtle px-3 py-2 whitespace-nowrap",
                      // 有未保存改动的行，行首一道蓝线（与矩阵格子的蓝角标同义）
                      dirtyIds.has(item.id) && "shadow-[inset_3px_0_0_var(--bg-accent-primary)]"
                    )}
                  >
                    {productById.get(item.product_id)?.name ?? "—"}
                  </TableCell>
                  <TableCell className="border-r border-b border-subtle px-3 py-2 whitespace-nowrap">
                    {item.stage_label}
                  </TableCell>
                  <TableCell className="border-r border-b border-subtle px-3 py-2">
                    <StageReviewKindBadge kind={item.kind as never} />
                  </TableCell>
                  <TableCell className="border-r border-b border-subtle px-3 py-2">{item.title}</TableCell>
                  <TableCell className="border-r border-b border-subtle px-3 py-2 whitespace-nowrap">
                    <KeepCutSegment
                      value={item.selected}
                      editable={editable}
                      keepLockReason={keepLock ? t(`review_tailoring.matrix.${keepLock}`) : null}
                      onChange={(keep) => onToggle(item.id, keep)}
                    />
                  </TableCell>
                  <TableCell className="min-w-[260px] border-r border-b border-subtle px-3 py-2">
                    {!item.selected ? (
                      reason || editable ? (
                        <button
                          type="button"
                          className={cn(
                            "group flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-13 transition-colors",
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
                            <Pencil className="size-3.5 shrink-0 text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                          )}
                        </button>
                      ) : (
                        <span className="text-12 text-placeholder">{t("review_tailoring.matrix.reason_missing")}</span>
                      )
                    ) : (
                      <span className="text-tertiary">—</span>
                    )}
                  </TableCell>
                  <TableCell className="border-r border-b border-subtle px-3 py-2 whitespace-nowrap">
                    {item.created_by_detail?.display_name ?? "—"}
                  </TableCell>
                  <TableCell className="border-r border-b border-subtle px-3 py-2 whitespace-nowrap">
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

      <BulkReasonModal
        isOpen={isBulkOpen}
        missingCount={missing.length}
        visibleCount={visibleCut.length}
        onApply={applyBulk}
        onClose={() => setIsBulkOpen(false)}
      />
    </div>
  );
};
