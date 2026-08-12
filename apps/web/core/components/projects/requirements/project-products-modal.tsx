/**
 * 「管理产品」弹窗：在弹窗内展示并勾选本项目关联的产品。
 *
 * 这一步是整条链路的入口：需求来自产品，项目必须先关联产品，候选池才有东西。
 * 候选项是当前用户看得见的工作区产品；后端会再校验可见性与同工作区。
 */
import { useEffect, useMemo, useState } from "react";
import { xor } from "lodash-es";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProduct, TProductProject } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { ProductChip } from "@/components/products/product-chip";

type TProps = {
  isOpen: boolean;
  /** 工作区里当前用户可见的产品 */
  products: TProduct[];
  isProductsLoading: boolean;
  /** 本项目已关联的产品 */
  links: TProductProject[];
  isSubmitting: boolean;
  handleClose: () => void;
  onSubmit: (payload: { products: string[]; removed_products: string[] }) => Promise<void>;
};

export const ProjectProductsModal = (props: TProps) => {
  const { isOpen, products, isProductsLoading, links, isSubmitting, handleClose, onSubmit } = props;
  const { t } = useTranslation();

  const linkedIds = useMemo(() => links.map((link) => link.product), [links]);
  const linkByProductId = useMemo(() => new Map(links.map((link) => [link.product, link])), [links]);
  const [selectedIds, setSelectedIds] = useState<string[]>(linkedIds);

  // 每次打开都以服务端的现状为准，不要沿用上一次关掉时的草稿选择
  useEffect(() => {
    if (isOpen) setSelectedIds(linkedIds);
  }, [isOpen, linkedIds]);

  const toggle = (productId: string) =>
    setSelectedIds((current) =>
      current.includes(productId) ? current.filter((item) => item !== productId) : [...current, productId]
    );

  /** 求差集后拆成增删两份，与工作项挂模块的接口同形 */
  const handleSubmit = async () => {
    const changed = xor(linkedIds, selectedIds);
    if (!changed.length) {
      handleClose();
      return;
    }
    const added: string[] = [];
    const removed: string[] = [];
    for (const productId of changed) {
      if (linkedIds.includes(productId)) removed.push(productId);
      else added.push(productId);
    }

    try {
      await onSubmit({ products: added, removed_products: removed });
      handleClose();
    } catch (error) {
      const payload = error as { error?: string; code?: string } | null;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message:
          payload?.code === "PRODUCT_HAS_LINKED_REQUIREMENTS"
            ? t("project_products.has_linked_requirements")
            : (payload?.error ?? t("project_requirements.toast.failed")),
      });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="border-b border-subtle px-5 py-4">
        <h3 className="text-body-sm-semibold text-primary">{t("project_products.manage")}</h3>
        <p className="mt-1 text-caption-sm-regular text-tertiary">{t("project_products.manage_subtitle")}</p>
      </div>

      <div className="max-h-96 overflow-y-auto px-3 py-2">
        {isProductsLoading ? (
          <Loader className="space-y-2 p-2">
            <Loader.Item height="40px" />
            <Loader.Item height="40px" />
            <Loader.Item height="40px" />
          </Loader>
        ) : products.length === 0 ? (
          <p className="px-3 py-8 text-center text-13 text-secondary">
            {t("project_products.no_visible_products")}
          </p>
        ) : (
          products.map((product) => {
            const isSelected = selectedIds.includes(product.id);
            const link = linkByProductId.get(product.id);
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => toggle(product.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md border-[0.5px] border-transparent px-3 py-2.5 text-left text-13 text-primary transition-colors",
                  "hover:bg-layer-transparent-hover",
                  isSelected && "border-accent-strong bg-accent-primary/5"
                )}
              >
                <Checkbox checked={isSelected} onChange={() => toggle(product.id)} />
                <ProductChip identifier={product.identifier} name={product.name} className="min-w-0" />
                <span className="ml-auto shrink-0 text-11 text-tertiary">
                  {link
                    ? t("project_products.linked_meta", { count: link.requirement_count ?? 0 })
                    : t("project_products.unlinked_meta")}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" size="lg" onClick={handleClose}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="lg"
          loading={isSubmitting}
          disabled={isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {t("confirm")}
        </Button>
      </div>
    </ModalCore>
  );
};
