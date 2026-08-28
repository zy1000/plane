"use client";

import { LayoutList, Package } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TProductProject } from "@plane/types";
import { cn } from "@plane/utils";

type TProps = {
  links: TProductProject[];
  isLoading: boolean;
  selectedProductId: string | null;
  onSelect: (productId: string | null) => void;
  canManage: boolean;
  onManage: () => void;
};

/**
 * 项目需求页左侧栏的产品区：看关联、点选范围、打开管理弹窗。
 *
 * 名单用 ProductProject 关联行（含 0 条需求的产品）。项目侧接口不填
 * requirement_count，页面会先叠上 facets.by_product 再传入；分面不当名单。
 */
export const ProjectRequirementProductNav = (props: TProps) => {
  const { links, isLoading, selectedProductId, onSelect, canManage, onManage } = props;
  const { t } = useTranslation();
  const isAllActive = selectedProductId === null;
  const totalCount = links.reduce((sum, link) => sum + (link.requirement_count ?? 0), 0);

  return (
    <div className="shrink-0">
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1.5">
        <h3 className="text-caption-sm-medium text-tertiary">{t("project_requirements.sidebar_products")}</h3>
        {canManage && (
          <button
            type="button"
            onClick={onManage}
            className="text-caption-sm-medium text-secondary transition-colors hover:text-primary"
          >
            {t("project_requirements.sidebar_manage")}
          </button>
        )}
      </div>
      {!isLoading && links.length > 0 && (
        <div className="space-y-0.5 px-2 pb-2">
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-13 transition-colors",
              isAllActive
                ? "bg-accent-primary/10 text-accent-primary"
                : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
            )}
          >
            <LayoutList className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate font-medium">{t("project_requirements.all_products")}</span>
            <span
              className={cn(
                "text-caption-sm-medium tabular-nums",
                isAllActive ? "text-accent-primary" : "text-placeholder"
              )}
            >
              {totalCount}
            </span>
          </button>
          {links.map((link) => {
            const isActive = selectedProductId === link.product;
            return (
              <button
                key={link.product}
                type="button"
                onClick={() => onSelect(isActive ? null : link.product)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-13 transition-colors",
                  isActive
                    ? "bg-accent-primary/10 text-accent-primary"
                    : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                )}
              >
                <Package className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate" title={link.product_name || link.product_identifier}>
                  {link.product_name || link.product_identifier}
                </span>
                <span
                  className={cn(
                    "text-caption-sm-medium tabular-nums",
                    isActive ? "text-accent-primary" : "text-placeholder"
                  )}
                >
                  {link.requirement_count ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
