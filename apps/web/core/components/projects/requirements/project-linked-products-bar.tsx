/**
 * 方案 A：需求页顶部「已关联产品」常驻条。
 *
 * 展示与编辑拆开 —— 这里只读展示 productLinks，chip 兼做产品筛选；
 * 「管理」打开 ProjectProductsModal。替代原先仅在 ≥2 个有需求的产品时才出现的页签。
 */
import type { FC } from "react";
import { useTranslation } from "@plane/i18n";
import type { TProductProject } from "@plane/types";
import { cn } from "@plane/utils";
import { ProductChip } from "@/components/products/product-chip";

type TProps = {
  links: TProductProject[];
  isLoading?: boolean;
  /** 当前产品筛选；undefined = 全部 */
  value: string | undefined;
  onChange: (productId: string | undefined) => void;
  canManage: boolean;
  onManage: () => void;
};

export const ProjectLinkedProductsBar: FC<TProps> = ({
  links,
  isLoading = false,
  value,
  onChange,
  canManage,
  onManage,
}) => {
  const { t } = useTranslation();

  const handleChipClick = (productId: string) => {
    onChange(value === productId ? undefined : productId);
  };

  return (
    <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-subtle bg-surface-1 px-4 py-2">
      <span className="shrink-0 text-caption-md-medium text-secondary">
        {t("project_products.linked_label")}
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {isLoading && links.length === 0 ? (
          <span className="text-12 text-placeholder">{t("loading")}</span>
        ) : links.length === 0 ? (
          <span className="text-12 text-tertiary">{t("project_products.empty")}</span>
        ) : (
          links.map((link) => {
            const isActive = value === link.product;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => handleChipClick(link.product)}
                aria-pressed={isActive}
                className={cn(
                  "inline-flex max-w-full items-center rounded-md border-[0.5px] px-1.5 py-0.5 transition-colors",
                  isActive
                    ? "border-accent-strong bg-accent-primary/5"
                    : "border-subtle bg-surface-1 hover:border-strong hover:bg-layer-transparent-hover"
                )}
              >
                <ProductChip
                  identifier={link.product_identifier}
                  name={link.product_name}
                  className="pointer-events-none"
                />
              </button>
            );
          })
        )}
      </div>

      {canManage && (
        <button
          type="button"
          onClick={onManage}
          className="shrink-0 rounded-sm px-1.5 py-0.5 text-caption-md-medium text-accent-primary transition-colors hover:bg-accent-primary/5"
        >
          {t("project_products.manage_short")}
        </button>
      )}
    </div>
  );
};
