import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TReviewTailoringProduct } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { useProjectProducts } from "@/hooks/store/use-project-products";

/**
 * 给已有的裁剪表补几列产品。候选 = 项目已关联的产品 − 表里已有的。
 *
 * 只增不删：删列要么走「取消勾选后修订生效」，要么等产品被解除关联时由 sync_items
 * 清掉没生成过评审的空列。
 */
export const AddProductsModal = observer(function AddProductsModal({
  isOpen,
  isSubmitting,
  workspaceSlug,
  projectId,
  existingProducts,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  workspaceSlug: string;
  projectId: string;
  existingProducts: TReviewTailoringProduct[];
  onClose: () => void;
  onSubmit: (productIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const { links, isLoading } = useProjectProducts({ workspaceSlug, projectId });
  const [selected, setSelected] = useState<string[]>([]);

  const candidates = useMemo(() => {
    const taken = new Set(existingProducts.map((product) => product.id));
    return links.filter((link) => !taken.has(link.product));
  }, [links, existingProducts]);

  useEffect(() => {
    if (isOpen) setSelected([]);
  }, [isOpen]);

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="p-5">
        <h2 className="text-16 font-semibold text-primary">{t("review_tailoring.actions.add_products_title")}</h2>

        <div className="mt-4">
          {isLoading ? (
            <p className="text-12 text-tertiary">…</p>
          ) : candidates.length === 0 ? (
            <p className="text-12 text-tertiary">{t("review_tailoring.actions.add_products_empty")}</p>
          ) : (
            <div className="max-h-64 divide-y divide-subtle overflow-y-auto rounded border border-subtle">
              {candidates.map((link) => (
                <label
                  key={link.product}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-layer-1"
                >
                  <Checkbox
                    checked={selected.includes(link.product)}
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(link.product)
                          ? current.filter((id) => id !== link.product)
                          : [...current, link.product]
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-12 text-primary">{link.product_name}</span>
                  {link.product_code && <span className="shrink-0 text-11 text-tertiary">{link.product_code}</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={isSubmitting}
            disabled={selected.length === 0 || isSubmitting}
            onClick={() => onSubmit(selected)}
          >
            {t("review_tailoring.actions.add_products")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
