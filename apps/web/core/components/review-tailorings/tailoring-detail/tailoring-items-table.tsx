import { useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import type { TReviewTailoringItem, TReviewTailoringProduct } from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
import { StageReviewKindBadge } from "@/components/template-management/reviews/stage-review-kind-badge";
import { collectMissingReasons } from "./tailoring-matrix-model";

/**
 * 裁剪明细：把矩阵摊平成一行一格，字段与原始裁剪表一致（产品 / 阶段 / 评审类型 /
 * 评审名称 / 是否裁剪 / 裁剪原因 / 创建人 / 创建时间）。
 *
 * 矩阵适合勾，明细适合读和补原因 —— 所以原因在这里可以行内改，改的还是同一份格子。
 */
export const TailoringItemsTable = ({
  items,
  products,
  editable,
  onReasonChange,
  onBulkReason,
}: {
  items: TReviewTailoringItem[];
  products: TReviewTailoringProduct[];
  editable: boolean;
  onReasonChange: (itemId: string, reason: string) => void;
  onBulkReason: (itemIds: string[], reason: string) => void;
}) => {
  const { t } = useTranslation();
  const [productFilter, setProductFilter] = useState<string>("all");
  const [bulkReason, setBulkReason] = useState("");
  const [showBulk, setShowBulk] = useState(false);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const missing = useMemo(() => collectMissingReasons(items), [items]);

  const visible = useMemo(() => {
    const rows = productFilter === "all" ? items : items.filter((item) => item.product_id === productFilter);
    // 先按产品、再按阶段、最后按模板顺序，读起来是「这个产品每个阶段要做什么」
    return [...rows].sort((a, b) => {
      const left = productById.get(a.product_id)?.name ?? "";
      const right = productById.get(b.product_id)?.name ?? "";
      if (left !== right) return left.localeCompare(right);
      if (a.stage_sort_order !== b.stage_sort_order) return a.stage_sort_order - b.stage_sort_order;
      return a.template_sort_order - b.template_sort_order;
    });
  }, [items, productFilter, productById]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={productFilter}
          onChange={(event) => setProductFilter(event.target.value)}
          className="focus:border-accent-primary h-8 rounded border border-subtle bg-surface-1 px-2 text-12 text-primary outline-none"
        >
          <option value="all">{t("review_tailoring.items.filter_all_products")}</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>

        {editable && missing.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setShowBulk((current) => !current)}>
            {t("review_tailoring.items.bulk_reason")} ({missing.length})
          </Button>
        )}
      </div>

      {showBulk && editable && missing.length > 0 && (
        <div className="rounded-md border border-subtle bg-layer-1 p-3">
          <p className="mb-2 text-12 text-secondary">{t("review_tailoring.items.bulk_reason_title")}</p>
          <div className="flex gap-2">
            <input
              value={bulkReason}
              onChange={(event) => setBulkReason(event.target.value)}
              placeholder={t("review_tailoring.matrix.reason_placeholder")}
              className="focus:border-accent-primary h-8 flex-1 rounded border border-subtle bg-surface-1 px-2 text-12 text-primary outline-none"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={!bulkReason.trim()}
              onClick={() => {
                onBulkReason(
                  missing.map((item) => item.id),
                  bulkReason.trim()
                );
                setBulkReason("");
                setShowBulk(false);
              }}
            >
              {t("review_tailoring.items.bulk_reason_apply", { count: missing.length })}
            </Button>
          </div>
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
              const tailoredOut = !item.selected;
              return (
                <TableRow key={item.id} className="bg-surface-1 hover:bg-surface-2">
                  <TableCell className="border-r border-b border-subtle px-3 py-2 whitespace-nowrap">
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
                    <span className={cn("text-12", tailoredOut ? "text-danger-primary" : "text-secondary")}>
                      {t(`review_tailoring.items.tailored_${tailoredOut ? "yes" : "no"}`)}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-[220px] border-r border-b border-subtle px-3 py-2">
                    {tailoredOut ? (
                      editable ? (
                        <input
                          defaultValue={item.reason}
                          placeholder={t("review_tailoring.matrix.reason_placeholder")}
                          // blur 才提交：边打字边推状态会让整张表每个字符重渲一次
                          onBlur={(event) => {
                            const next = event.target.value.trim();
                            if (next !== item.reason) onReasonChange(item.id, next);
                          }}
                          className={cn(
                            "focus:border-accent-primary h-7 w-full rounded border bg-surface-1 px-2 text-12 text-primary outline-none",
                            item.reason.trim() ? "border-subtle" : "border-warning-primary"
                          )}
                        />
                      ) : (
                        <span className={cn("text-12", item.reason ? "text-primary" : "text-warning-primary")}>
                          {item.reason || t("review_tailoring.matrix.reason_missing")}
                        </span>
                      )
                    ) : (
                      <span className="text-tertiary">—</span>
                    )}
                  </TableCell>
                  <TableCell className="border-r border-b border-subtle px-3 py-2 whitespace-nowrap">
                    {item.created_by_detail?.display_name ?? "—"}
                  </TableCell>
                  <TableCell className="border-r border-b border-subtle px-3 py-2 whitespace-nowrap">
                    {renderFormattedDate(item.created_at) ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};
