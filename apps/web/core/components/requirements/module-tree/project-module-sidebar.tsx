"use client";

import { useTranslation } from "@plane/i18n";
import type { TProductProject } from "@plane/types";
import type { TRequirementModulesStore } from "@/hooks/store/use-requirement-modules";
import { ProjectRequirementTree } from "./project-requirement-tree";

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
 * 项目需求页左侧浏览栏：一棵「全部需求 → 产品 → 模块」的树，只做浏览与筛选。
 * 产品关联的增删在项目「产品」子菜单页（components/projects/products）。
 *
 * 树的数据来自「已关联需求所涉及的产品模块」（祖先闭包 + 子树计数），项目本身不落模块字段；
 * 关联了但没有需求的产品从关联行里补出来，收在树底部。
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
    <aside className="hidden w-[240px] shrink-0 flex-col border-r border-subtle bg-surface-1 sm:flex">
      <div className="px-3 pt-3 pb-1.5 text-xs font-medium text-tertiary">{t("project_requirements.tree.title")}</div>
      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        <ProjectRequirementTree
          groups={store.groups}
          total={store.total}
          productLinks={productLinks}
          isProductsLoading={isProductsLoading}
          selectedProductId={selectedProductId}
          selectedModuleId={selectedModuleId}
          onSelect={onSelect}
          onSelectProduct={onSelectProduct}
        />
      </div>
    </aside>
  );
};
