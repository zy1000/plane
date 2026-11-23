"use client";

import { useState } from "react";
import { ChevronsDownUp } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
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
 * 项目需求页左侧浏览栏：标题 + 全部收起 + 搜索，下面是「全部需求 → 产品集 / 产品 → 模块」的树，
 * 只做浏览与筛选。产品关联的增删在项目「产品」子菜单页（components/projects/products）。
 *
 * 树的数据来自「已关联需求所涉及的产品模块」（祖先闭包 + 子树计数），项目本身不落模块字段；
 * 关联了但没有需求的产品从关联行里补出来，灰显在本组末尾。
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
  const [query, setQuery] = useState("");
  const [collapseSignal, setCollapseSignal] = useState(0);

  return (
    <aside className="hidden w-[260px] shrink-0 flex-col border-r border-subtle bg-surface-1 sm:flex">
      <div className="flex h-12 shrink-0 items-center justify-between pr-2 pl-4">
        <span className="text-14 font-semibold text-primary">{t("project_requirements.tree.title")}</span>
        <IconButton
          variant="ghost"
          size="base"
          icon={ChevronsDownUp}
          aria-label={t("project_requirements.tree.collapse_all")}
          title={t("project_requirements.tree.collapse_all")}
          onClick={() => setCollapseSignal((value) => value + 1)}
        />
      </div>
      <div className="shrink-0 px-3 pb-2">
        <label className="flex h-8 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 text-placeholder focus-within:border-accent-strong">
          <SearchIcon className="size-3.5 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("project_requirements.tree.search_placeholder")}
            aria-label={t("project_requirements.tree.search_placeholder")}
            className="min-w-0 flex-1 border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label={t("common.clear")}
              onClick={() => setQuery("")}
              className="grid shrink-0 place-items-center text-tertiary hover:text-primary"
            >
              <CloseIcon className="size-3" />
            </button>
          )}
        </label>
      </div>
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
          query={query}
          collapseSignal={collapseSignal}
        />
      </div>
    </aside>
  );
};
