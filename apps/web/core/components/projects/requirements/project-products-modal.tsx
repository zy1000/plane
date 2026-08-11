/**
 * 「关联产品」弹窗。
 *
 * 这一步是整条链路的入口：需求来自产品，项目必须先关联产品，候选池才有东西。没有
 * 这个弹窗，后端的 POST .../projects/:id/products/ 就没有任何调用方，需求关联按钮会
 * 永远停在禁用态。
 *
 * 候选项是**当前用户看得见的**工作区产品（productService.list 已经按可见性过滤过：
 * 公开产品 / 自己是负责人、评审人或成员的私密产品）。后端会再校验一次可见性与同
 * 工作区，见 utils/requirement_project.resolve_linkable_products。
 */
import { useEffect, useMemo, useState } from "react";
import { xor } from "lodash-es";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProduct, TProductProject } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";

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
        // 解除关联时后端会挡下「该产品下还有需求关联在本项目里」，那句提示比通用
        // 失败文案有用得多
        message:
          payload?.code === "PRODUCT_HAS_LINKED_REQUIREMENTS"
            ? t("project_products.has_linked_requirements")
            : (payload?.error ?? t("project_requirements.toast.failed")),
      });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="border-b border-subtle px-4 py-3">
        <h3 className="text-14 font-medium text-primary">{t("project_products.title")}</h3>
      </div>

      <div className="max-h-96 overflow-y-auto px-2 py-2">
        {isProductsLoading ? (
          <Loader className="space-y-2 p-2">
            <Loader.Item height="36px" />
            <Loader.Item height="36px" />
            <Loader.Item height="36px" />
          </Loader>
        ) : products.length === 0 ? (
          // 这一支是「工作区里一个可见产品都没有」，不是「还没关联」—— 两件事文案不能共用
          <p className="px-3 py-8 text-center text-13 text-secondary">
            {t("project_products.no_visible_products")}
          </p>
        ) : (
          products.map((product) => {
            const isSelected = selectedIds.includes(product.id);
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => toggle(product.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-13 text-primary",
                  "hover:bg-layer-transparent-hover",
                  isSelected && "bg-accent-primary/5"
                )}
              >
                <Checkbox checked={isSelected} onChange={() => toggle(product.id)} />
                <span className="shrink-0 rounded bg-layer-2 px-1.5 py-0.5 text-11 text-secondary">
                  {product.identifier}
                </span>
                <span className="min-w-0 flex-1 truncate">{product.name}</span>
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-subtle px-4 py-3">
        <Button variant="neutral-primary" size="sm" onClick={handleClose}>
          {t("cancel")}
        </Button>
        <Button variant="primary" size="sm" loading={isSubmitting} disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {t("submit")}
        </Button>
      </div>
    </ModalCore>
  );
};
