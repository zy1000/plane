"use client";

import { useTranslation } from "@plane/i18n";
import type { TProductProject } from "@plane/types";
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
};

/**
 * 项目需求页左侧浏览栏：上半产品、下半只读模块树。
 *
 * 只做浏览与筛选。产品关联的增删在项目「产品」子菜单页（components/projects/products）。
 *
 * 树为三级：全部需求 → 产品 → 该产品模块。数据来自「已关联需求所涉及的
 * 产品模块」（祖先闭包 + 子树计数），项目本身不落模块字段。
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
  } = props;
  const { t } = useTranslation();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-subtle bg-surface-2 sm:flex">
      <ProjectRequirementProductNav
        links={productLinks}
        isLoading={isProductsLoading}
        selectedProductId={selectedProductId}
        onSelect={onSelectProduct}
      />
      <div className="mx-3 border-t border-subtle" />
      <div className="px-3 pt-3 pb-1.5 text-caption-sm-medium text-tertiary">
        {t("requirement_modules.sidebar_label")}
      </div>
      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <RequirementModuleTree
          modules={[]}
          productGroups={store.groups}
          total={store.total}
          selectedModuleId={selectedModuleId}
          selectedProductId={selectedProductId}
          onSelect={onSelect}
          onSelectProduct={onSelectProduct}
          readonly
        />
      </div>
    </aside>
  );
};
