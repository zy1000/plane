"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, Folder, ListChecks, Package } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TProductProject, TProjectRequirementModuleGroup, TRequirementModule } from "@plane/types";
import { cn } from "@plane/utils";

/** 每深一层缩进 18px，不画连接线 */
const INDENT = 18;

/** 选中模块所在的产品与祖先模块（不含自己），用来把选中项所在的路径展开 */
const findModulePath = (
  groups: TProjectRequirementModuleGroup[],
  moduleId: string
): { productId: string; ancestorIds: string[] } | null => {
  const walk = (modules: TRequirementModule[], trail: string[]): string[] | null => {
    for (const item of modules) {
      if (item.id === moduleId) return trail;
      const found = walk(item.children ?? [], [...trail, item.id]);
      if (found) return found;
    }
    return null;
  };
  for (const group of groups) {
    const ancestorIds = walk(group.modules, []);
    if (ancestorIds) return { productId: group.product_id, ancestorIds };
  }
  return null;
};

/**
 * 树里的一行：箭头位 + 图标 + 名称 + 计数，样式同阶段评审的分组栏。箭头和名称是两个按钮：
 * 点箭头只展开 / 收起，点名称才切换选中。
 */
const TreeRow = ({
  depth,
  icon,
  label,
  count,
  isActive,
  isMuted = false,
  isExpanded,
  toggleLabel,
  onToggle,
  onSelect,
}: {
  depth: number;
  icon: ReactNode;
  label: string;
  count?: number;
  isActive: boolean;
  /** 「无需求的产品」那一段：灰字、不加粗 */
  isMuted?: boolean;
  /** undefined = 不能展开，只留出箭头位保证图标对齐 */
  isExpanded?: boolean;
  toggleLabel?: string;
  onToggle?: () => void;
  onSelect: () => void;
}) => (
  <div
    style={{ paddingLeft: 6 + depth * INDENT }}
    className={cn(
      "flex h-8 w-full items-center gap-1 rounded-md pr-1.5 transition-colors duration-150",
      isActive
        ? "bg-layer-transparent-active text-primary"
        : isMuted
          ? "text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
          : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
    )}
  >
    {isExpanded === undefined ? (
      <span className="size-4 shrink-0" />
    ) : (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={toggleLabel}
        className="grid size-4 shrink-0 cursor-pointer place-items-center rounded-sm text-tertiary hover:text-primary"
      >
        {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
    )}
    <button
      type="button"
      onClick={onSelect}
      aria-current={isActive ? "true" : undefined}
      className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 text-left outline-none"
      title={label}
    >
      <span className={cn("grid size-4 shrink-0 place-items-center", isActive ? "text-primary" : "text-tertiary")}>
        {icon}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-sm", !isMuted && "font-medium")}>{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            "min-w-[24px] shrink-0 text-center text-xs tabular-nums",
            isMuted ? "text-placeholder" : "font-medium text-primary"
          )}
        >
          {count}
        </span>
      )}
    </button>
  </div>
);

type TProps = {
  /** 有关联需求的产品及其模块树（模块已剪掉计数为 0 的分支） */
  groups: TProjectRequirementModuleGroup[];
  total: number;
  /** 项目关联的全部产品，用来列出「无需求的产品」 */
  productLinks: TProductProject[];
  isProductsLoading: boolean;
  selectedProductId: string | null;
  selectedModuleId: string | null;
  onSelect: (moduleId: string | null) => void;
  onSelectProduct: (productId: string | null) => void;
};

/**
 * 项目研发需求页左栏的一棵树：「全部需求」→ 产品 → 模块。「全部需求」与产品平级，不是根节点；
 * 关联了但一条需求都没有的产品收在分隔线下的「无需求的产品」里，默认收起。
 *
 * 选中口径同以前的两段式左栏：点产品 = 只按产品筛；点模块 = 按模块筛，并带上它所属的产品。
 * 产品默认展开、模块默认收起；从 URL 带进来的选中项，所在路径会自动展开。
 */
export const ProjectRequirementTree = (props: TProps) => {
  const {
    groups,
    total,
    productLinks,
    isProductsLoading,
    selectedProductId,
    selectedModuleId,
    onSelect,
    onSelectProduct,
  } = props;
  const { t } = useTranslation();
  const [collapsedProductIds, setCollapsedProductIds] = useState<Set<string>>(() => new Set());
  const [expandedModuleIds, setExpandedModuleIds] = useState<Set<string>>(() => new Set());
  const [isEmptyOpen, setIsEmptyOpen] = useState(false);

  const productGroups = useMemo(() => groups.filter((group) => group.total > 0), [groups]);
  const emptyProducts = useMemo(() => {
    if (isProductsLoading) return [];
    const withRequirements = new Set(productGroups.map((group) => group.product_id));
    return productLinks.filter((link) => !withRequirements.has(link.product));
  }, [isProductsLoading, productGroups, productLinks]);

  // 选中的模块藏在收起的分支里时，把它所在的产品和祖先模块展开
  useEffect(() => {
    if (!selectedModuleId) return;
    const path = findModulePath(productGroups, selectedModuleId);
    if (!path) return;
    setCollapsedProductIds((current) => {
      if (!current.has(path.productId)) return current;
      const next = new Set(current);
      next.delete(path.productId);
      return next;
    });
    setExpandedModuleIds((current) =>
      path.ancestorIds.every((id) => current.has(id)) ? current : new Set([...current, ...path.ancestorIds])
    );
  }, [productGroups, selectedModuleId]);

  // 选中的是一个没有需求的产品（比如 URL 带进来的），把那一段打开
  const isEmptyProductSelected = emptyProducts.some((link) => link.product === selectedProductId);
  useEffect(() => {
    if (isEmptyProductSelected) setIsEmptyOpen(true);
  }, [isEmptyProductSelected]);

  const toggleIn = (setter: typeof setExpandedModuleIds, id: string) =>
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandLabel = t("project_requirements.tree.expand");
  const collapseLabel = t("project_requirements.tree.collapse");

  const selectProduct = (productId: string | null) => {
    onSelect(null);
    onSelectProduct(productId);
  };

  const renderModules = (productId: string, modules: TRequirementModule[], depth: number): ReactNode =>
    modules.map((item) => {
      const hasChildren = (item.children ?? []).length > 0;
      const isExpanded = expandedModuleIds.has(item.id);
      return (
        <Fragment key={item.id}>
          <TreeRow
            depth={depth}
            icon={<Folder className="size-4" />}
            label={item.name}
            count={item.count}
            isActive={selectedModuleId === item.id}
            isExpanded={hasChildren ? isExpanded : undefined}
            toggleLabel={isExpanded ? collapseLabel : expandLabel}
            onToggle={() => toggleIn(setExpandedModuleIds, item.id)}
            onSelect={() => {
              onSelect(item.id);
              onSelectProduct(productId);
            }}
          />
          {hasChildren && isExpanded && renderModules(productId, item.children, depth + 1)}
        </Fragment>
      );
    });

  return (
    <div className="flex flex-col gap-0.5">
      <TreeRow
        depth={0}
        icon={<ListChecks className="size-4" />}
        label={t("requirement_modules.all")}
        count={total}
        isActive={!selectedProductId && !selectedModuleId}
        onSelect={() => selectProduct(null)}
      />

      {productGroups.map((group) => {
        const hasModules = group.modules.length > 0;
        const isExpanded = !collapsedProductIds.has(group.product_id);
        const label = group.product_name || group.product_identifier;
        return (
          <Fragment key={group.product_id}>
            <TreeRow
              depth={0}
              icon={<Package className="size-4" />}
              label={label}
              count={group.total}
              isActive={selectedProductId === group.product_id && !selectedModuleId}
              isExpanded={hasModules ? isExpanded : undefined}
              toggleLabel={isExpanded ? collapseLabel : expandLabel}
              onToggle={() => toggleIn(setCollapsedProductIds, group.product_id)}
              onSelect={() => selectProduct(group.product_id)}
            />
            {hasModules && isExpanded && renderModules(group.product_id, group.modules, 1)}
          </Fragment>
        );
      })}

      {emptyProducts.length > 0 && (
        <>
          <div className="mx-2 my-2 border-t border-subtle" />
          <TreeRow
            depth={0}
            icon={<Package className="size-4" />}
            label={t("project_requirements.tree.products_without_requirements")}
            count={emptyProducts.length}
            isActive={false}
            isMuted
            isExpanded={isEmptyOpen}
            toggleLabel={isEmptyOpen ? collapseLabel : expandLabel}
            onToggle={() => setIsEmptyOpen((value) => !value)}
            onSelect={() => setIsEmptyOpen((value) => !value)}
          />
          {isEmptyOpen &&
            emptyProducts.map((link) => (
              <TreeRow
                key={link.product}
                depth={1}
                icon={<Package className="size-4" />}
                label={link.product_name || link.product_identifier}
                isActive={selectedProductId === link.product && !selectedModuleId}
                isMuted
                onSelect={() => selectProduct(link.product)}
              />
            ))}
        </>
      )}
    </div>
  );
};
