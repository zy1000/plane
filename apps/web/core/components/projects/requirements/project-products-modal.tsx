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
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProduct, TProductProject } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { ProjectProductPickerRow } from "./project-product-picker-row";

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

const matchesQuery = (product: TProduct, query: string) => {
  if (!query) return true;
  const haystack = `${product.name ?? ""} ${product.identifier ?? ""}`.toLowerCase();
  return haystack.includes(query);
};

export const ProjectProductsModal = (props: TProps) => {
  const { isOpen, products, isProductsLoading, links, isSubmitting, handleClose, onSubmit } = props;
  const { t } = useTranslation();

  const linkedIds = useMemo(() => links.map((link) => link.product), [links]);
  const linkByProductId = useMemo(() => new Map(links.map((link) => [link.product, link])), [links]);
  const [selectedIds, setSelectedIds] = useState<string[]>(linkedIds);
  const [searchQuery, setSearchQuery] = useState("");

  // 每次打开都以服务端的现状为准，不要沿用上一次关掉时的草稿选择
  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(linkedIds);
    setSearchQuery("");
  }, [isOpen, linkedIds]);

  const toggle = (productId: string) =>
    setSelectedIds((current) =>
      current.includes(productId) ? current.filter((item) => item !== productId) : [...current, productId]
    );

  const query = searchQuery.trim().toLowerCase();
  const filteredProducts = useMemo(
    () => products.filter((product) => matchesQuery(product, query)),
    [products, query]
  );
  const linkedProducts = filteredProducts.filter((product) => linkedIds.includes(product.id));
  const unlinkedProducts = filteredProducts.filter((product) => !linkedIds.includes(product.id));
  const addedCount = selectedIds.filter((id) => !linkedIds.includes(id)).length;
  const removedCount = linkedIds.filter((id) => !selectedIds.includes(id)).length;
  const footerDelta =
    addedCount === 0 && removedCount === 0
      ? t("project_products.footer_no_change")
      : [
          addedCount > 0 ? t("project_products.footer_will_add", { count: addedCount }) : null,
          removedCount > 0 ? t("project_products.footer_will_remove", { count: removedCount }) : null,
        ]
          .filter(Boolean)
          .join(" · ");

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

  const renderGroup = (title: string, rows: TProduct[]) => {
    if (rows.length === 0) return null;
    return (
      <div className="pb-1">
        <div className="px-3 pt-2 pb-1 text-caption-sm-medium text-tertiary">{title}</div>
        {rows.map((product) => {
          const link = linkByProductId.get(product.id);
          return (
            <ProjectProductPickerRow
              key={product.id}
              name={product.name}
              identifier={product.identifier}
              logoProps={product.logo_props}
              isSelected={selectedIds.includes(product.id)}
              isLinked={Boolean(link)}
              requirementCount={link?.requirement_count ?? 0}
              onToggle={() => toggle(product.id)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXXL}>
      <div className="border-b border-subtle px-5 py-4">
        <h3 className="text-body-sm-semibold text-primary">{t("project_products.manage")}</h3>
        <label className="relative mt-3 block">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-placeholder" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("project_products.search_placeholder")}
            className="h-8 w-full rounded-md border border-subtle bg-surface-1 pr-8 pl-8 text-12 text-primary outline-none placeholder:text-placeholder focus:border-accent-primary"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-secondary hover:bg-layer-2 hover:text-primary"
            >
              <CloseIcon className="size-3.5" />
            </button>
          )}
        </label>
      </div>

      <div className="vertical-scrollbar scrollbar-sm h-[min(36rem,60vh)] overflow-y-auto px-2 py-1">
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
        ) : filteredProducts.length === 0 ? (
          <p className="px-3 py-8 text-center text-13 text-secondary">{t("project_products.no_match")}</p>
        ) : (
          <>
            {renderGroup(t("project_products.linked_group", { count: linkedProducts.length }), linkedProducts)}
            {renderGroup(t("project_products.unlinked_group", { count: unlinkedProducts.length }), unlinkedProducts)}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-subtle px-5 py-3">
        <p className="min-w-0 truncate text-caption-sm-regular text-tertiary">
          {t("project_products.footer_selected", { count: selectedIds.length })}
          {" · "}
          {footerDelta}
        </p>
        <div className="flex shrink-0 items-center gap-2">
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
      </div>
    </ModalCore>
  );
};
