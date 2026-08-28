"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TProductProject } from "@plane/types";
import { cn } from "@plane/utils";
import type { TRequirementModulesStore } from "@/hooks/store/use-requirement-modules";
import { RequirementModuleTree } from "./module-tree";
import { ProjectRequirementProductNav } from "./project-requirement-product-nav";

type TProps = {
  store: TRequirementModulesStore;
  selectedModuleId: string | null;
  onSelect: (moduleId: string | null) => void;
  productLinks: TProductProject[];
  isProductsLoading: boolean;
  selectedProductId: string | null;
  onSelectProduct: (productId: string | null) => void;
  canManageProducts: boolean;
  onManageProducts: () => void;
};

/**
 * 项目需求页左侧浏览栏：上半产品、下半只读模块树。
 *
 * 树来自「已关联需求所涉及的产品模块」（祖先闭包 + 子树计数），项目本身不落
 * 模块字段。选中某个产品后只渲染该组，去掉不可点的产品分组标题。
 */
export const ProjectRequirementModuleSidebar = (props: TProps) => {
  const {
    store,
    selectedModuleId,
    onSelect,
    productLinks,
    isProductsLoading,
    selectedProductId,
    onSelectProduct,
    canManageProducts,
    onManageProducts,
  } = props;
  const { t } = useTranslation();
  const visibleGroups = useMemo(
    () =>
      selectedProductId ? store.groups.filter((group) => group.product_id === selectedProductId) : store.groups,
    [selectedProductId, store.groups]
  );
  const moduleTotal = selectedProductId ? (visibleGroups[0]?.total ?? 0) : store.total;
  const showProductHeaders = !selectedProductId && visibleGroups.length > 1;
  const isAllActive = selectedModuleId === null;

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-subtle bg-surface-2 sm:flex">
      <ProjectRequirementProductNav
        links={productLinks}
        isLoading={isProductsLoading}
        selectedProductId={selectedProductId}
        onSelect={onSelectProduct}
        canManage={canManageProducts}
        onManage={onManageProducts}
      />
      <div className="mx-3 border-t border-subtle" />
      <div className="px-3 pt-3 pb-1.5 text-caption-sm-medium text-tertiary">
        {t("requirement_modules.sidebar_label")}
      </div>
      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {/* 「全部需求」——不传 module_id 的口径，未挂靠模块的需求也在其中 */}
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
          <Layers className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-medium">{t("requirement_modules.all")}</span>
          <span
            className={cn(
              "text-caption-sm-medium tabular-nums",
              isAllActive ? "text-accent-primary" : "text-placeholder"
            )}
          >
            {moduleTotal}
          </span>
        </button>
        {visibleGroups.map((group) => (
          <div key={group.product_id} className="mt-1">
            {showProductHeaders && (
              <div className="flex items-center justify-between gap-2 px-2 pt-2 pb-1">
                <span className="min-w-0 truncate text-caption-sm-medium text-tertiary">{group.product_name}</span>
                <span className="text-caption-sm-medium text-placeholder tabular-nums">{group.total}</span>
              </div>
            )}
            <RequirementModuleTree
              modules={group.modules}
              total={group.total}
              selectedModuleId={selectedModuleId}
              onSelect={onSelect}
              readonly
              showAllNode={false}
            />
          </div>
        ))}
      </div>
    </aside>
  );
};
