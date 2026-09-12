import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Boxes, Package } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TReviewTailoringProduct } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import { ModalSearch, TailoringModalHeader } from "./modal-header";

const I18N = "review_tailoring.actions";

/**
 * 给裁剪表补几列产品。候选 = 项目已关联的产品；已在矩阵里的列出来但锁住，而不是直接消失。
 *
 * 只增不删：删列走矩阵表头的「移除这一列」，已生成过评审的列要走修订取消勾选。
 */
export const AddProductsModal = observer(function AddProductsModal({
  isOpen,
  isSubmitting,
  workspaceSlug,
  projectId,
  existingProducts,
  rowCount,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  workspaceSlug: string;
  projectId: string;
  existingProducts: TReviewTailoringProduct[];
  /** 纵轴行数：每加一列就是这么多格 */
  rowCount: number;
  onClose: () => void;
  onSubmit: (productIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const { links, isLoading } = useProjectProducts({ workspaceSlug, projectId });
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const taken = useMemo(() => new Set(existingProducts.map((product) => product.id)), [existingProducts]);
  const hasAvailable = links.some((link) => !taken.has(link.product));

  const keyword = query.trim().toLowerCase();
  const visible = keyword
    ? links.filter(
        (link) =>
          link.product_name.toLowerCase().includes(keyword) || (link.product_code ?? "").toLowerCase().includes(keyword)
      )
    : links;

  useEffect(() => {
    if (!isOpen) return;
    setSelected([]);
    setQuery("");
  }, [isOpen]);

  const toggle = (productId: string) =>
    setSelected((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]
    );

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <TailoringModalHeader
        icon={<Boxes className="size-5" />}
        title={t(`${I18N}.add_products_title`)}
        onClose={onClose}
      />

      {isLoading ? (
        <Loader className="space-y-2 px-6 pb-6">
          <Loader.Item height="40px" />
          <Loader.Item height="40px" />
        </Loader>
      ) : links.length === 0 ? (
        <p className="px-6 pb-6 text-13 text-tertiary">{t(`${I18N}.add_products_empty`)}</p>
      ) : (
        <div className="flex max-h-[min(24rem,60vh)] flex-col border-y border-subtle">
          <ModalSearch
            id="review-tailoring-add-products-search"
            value={query}
            placeholder={t(`${I18N}.add_products_search`)}
            onChange={setQuery}
          />
          <div className="min-h-0 flex-1 divide-y divide-subtle overflow-y-auto">
            {visible.length === 0 && (
              <p className="px-6 py-6 text-13 text-tertiary">{t(`${I18N}.add_products_no_match`)}</p>
            )}
            {visible.map((link) => {
              const inMatrix = taken.has(link.product);
              const isPicked = selected.includes(link.product);
              return (
                <label
                  key={link.product}
                  className={cn(
                    "flex h-12 items-center gap-3 px-6 text-14",
                    inMatrix ? "text-placeholder" : "cursor-pointer text-primary hover:bg-layer-transparent-hover",
                    isPicked && "bg-accent-subtle/60"
                  )}
                >
                  <Checkbox checked={isPicked || inMatrix} disabled={inMatrix} onChange={() => toggle(link.product)} />
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-layer-3 text-tertiary">
                    <Package className="size-3.5" />
                  </span>
                  <span className="min-w-0 truncate">{link.product_name}</span>
                  {link.product_code && (
                    <span className="shrink-0 text-12 text-placeholder tabular-nums">{link.product_code}</span>
                  )}
                  {inMatrix && (
                    <span className="ml-auto shrink-0 rounded border border-subtle px-1.5 text-11 text-placeholder">
                      {t(`${I18N}.add_products_in_matrix`)}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2.5 px-6 pt-4 pb-5">
        {links.length > 0 && !hasAvailable && (
          <span className="flex-1 text-12 text-tertiary">{t(`${I18N}.add_products_empty`)}</span>
        )}
        {selected.length > 0 && (
          <span className="flex-1 text-12 text-tertiary tabular-nums">
            {t(`${I18N}.add_products_summary`, { columns: selected.length, cells: selected.length * rowCount })}
          </span>
        )}
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="xl"
          loading={isSubmitting}
          disabled={selected.length === 0 || isSubmitting}
          onClick={() => onSubmit(selected)}
        >
          {t(`${I18N}.add_products_apply`, { count: selected.length })}
        </Button>
      </div>
    </ModalCore>
  );
});
