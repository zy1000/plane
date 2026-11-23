"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, Folder, Layers, ListChecks, Package } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TProductProject, TProjectRequirementModuleGroup, TRequirementModule } from "@plane/types";
import { cn } from "@plane/utils";

/** 模块每深一层缩进 16px，不画连接线；行高 28、13 号字，与各页共用的 ModuleTree 同一套数值 */
const INDENT = 16;

/** 树里的一个产品（或产品集）：关联行补出没有需求的那些，计数和模块取自模块分组 */
export type TProjectRequirementTreeProduct = {
  id: string;
  name: string;
  identifier: string;
  isSet: boolean;
  total: number;
  modules: TRequirementModule[];
};

/** 选中模块所在的产品与祖先模块（不含自己），用来把选中项所在的路径展开 */
const findModulePath = (
  products: TProjectRequirementTreeProduct[],
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
  for (const product of products) {
    const ancestorIds = walk(product.modules, []);
    if (ancestorIds) return { productId: product.id, ancestorIds };
  }
  return null;
};

/** 搜索：只留名字命中的模块及其祖先；返回剪过的树和需要展开的祖先 id */
const filterModules = (
  modules: TRequirementModule[],
  query: string
): { modules: TRequirementModule[]; expandIds: string[] } => {
  const expandIds: string[] = [];
  const walk = (items: TRequirementModule[]): TRequirementModule[] =>
    items.flatMap((item) => {
      const children = walk(item.children ?? []);
      if (children.length > 0) {
        expandIds.push(item.id);
        return [{ ...item, children }];
      }
      return item.name.toLowerCase().includes(query) ? [{ ...item, children: [] }] : [];
    });
  return { modules: walk(modules), expandIds };
};

/** 命中的那一段加底色 */
const Highlight = ({ text, query }: { text: string; query: string }) => {
  if (!query) return <>{text}</>;
  const index = text.toLowerCase().indexOf(query);
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-warning-subtle px-px text-inherit">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
};

const ToggleButton = ({
  isExpanded,
  label,
  onToggle,
}: {
  isExpanded: boolean;
  label: string;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={isExpanded}
    aria-label={label}
    className="grid size-3.5 shrink-0 cursor-pointer place-items-center rounded-sm text-tertiary hover:text-primary"
  >
    {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
  </button>
);

const rowStateClass = (isActive: boolean, isMuted = false) =>
  isActive
    ? "bg-layer-transparent-active text-primary"
    : isMuted
      ? "text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
      : "text-secondary hover:bg-layer-transparent-hover hover:text-primary";

/** 计数：不走 cn —— 它会把 text-primary 和 text-xs 当成同组，把字号吞掉 */
const Count = ({ value, isActive, isMuted }: { value: number; isActive: boolean; isMuted?: boolean }) => (
  <span
    className={`min-w-[24px] shrink-0 text-right text-xs tabular-nums ${
      isActive ? "font-medium text-primary" : isMuted ? "text-placeholder" : "text-tertiary"
    }`}
  >
    {value}
  </span>
);

/** 「全部需求」与模块行：箭头位 + 图标 + 名称 + 计数。点箭头只展开 / 收起，点名称才切换选中 */
const TreeRow = ({
  depth,
  icon,
  label,
  count,
  isActive,
  isExpanded,
  toggleLabel,
  onToggle,
  onSelect,
}: {
  depth: number;
  icon: ReactNode;
  label: ReactNode;
  count: number;
  isActive: boolean;
  /** undefined = 不能展开，只留出箭头位保证图标对齐 */
  isExpanded?: boolean;
  toggleLabel?: string;
  onToggle?: () => void;
  onSelect: () => void;
}) => (
  <div
    style={{ paddingLeft: 6 + depth * INDENT }}
    className={cn(
      "flex h-7 w-full items-center gap-1 rounded-md pr-1.5 transition-colors duration-150",
      rowStateClass(isActive)
    )}
  >
    {isExpanded === undefined || !onToggle ? (
      <span className="size-3.5 shrink-0" />
    ) : (
      <ToggleButton isExpanded={isExpanded} label={toggleLabel ?? ""} onToggle={onToggle} />
    )}
    <button
      type="button"
      onClick={onSelect}
      aria-current={isActive ? "true" : undefined}
      className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-[7px] text-left outline-none"
    >
      <span className={cn("grid size-3.5 shrink-0 place-items-center", isActive ? "text-primary" : "text-tertiary")}>
        {icon}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-13", isActive && "font-medium")}>{label}</span>
      <Count value={count} isActive={isActive} />
    </button>
  </div>
);

/** 产品 / 产品集行：两行（名称 + 编号）+ 着色图标块；没有需求的产品灰显、不能展开 */
const ProductRow = ({
  product,
  query,
  isActive,
  isExpanded,
  toggleLabel,
  onToggle,
  onSelect,
}: {
  product: TProjectRequirementTreeProduct;
  query: string;
  isActive: boolean;
  isExpanded?: boolean;
  toggleLabel: string;
  onToggle: () => void;
  onSelect: () => void;
}) => {
  const isEmpty = product.total === 0;
  const Icon = product.isSet ? Layers : Package;
  return (
    <div
      className={cn(
        "flex h-10 w-full items-center gap-1 rounded-md pr-1.5 pl-1.5 transition-colors duration-150",
        rowStateClass(isActive, isEmpty)
      )}
    >
      {isExpanded === undefined ? (
        <span className="size-3.5 shrink-0" />
      ) : (
        <ToggleButton isExpanded={isExpanded} label={toggleLabel} onToggle={onToggle} />
      )}
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? "true" : undefined}
        title={product.name}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 text-left outline-none"
      >
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-md",
            isEmpty
              ? "bg-layer-3 text-placeholder"
              : product.isSet
                ? "bg-label-indigo-bg text-label-indigo-icon"
                : "bg-accent-subtle text-accent-primary"
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className={cn("truncate text-13", !isEmpty && "font-medium", !isEmpty && !isActive && "text-primary")}>
            <Highlight text={product.name} query={query} />
          </span>
          {product.identifier && (
            <span className="truncate font-mono text-11 text-tertiary">
              <Highlight text={product.identifier} query={query} />
            </span>
          )}
        </span>
        <Count value={product.total} isActive={isActive} isMuted={isEmpty} />
      </button>
    </div>
  );
};

const SectionLabel = ({ label, count }: { label: string; count: number }) => (
  <div className="flex items-center justify-between pt-4 pr-2.5 pb-1 pl-2 text-xs">
    <span className="font-medium text-tertiary">{label}</span>
    <span className="text-placeholder tabular-nums">{count}</span>
  </div>
);

type TProps = {
  /** 有关联需求的产品及其模块树（模块已剪掉计数为 0 的分支） */
  groups: TProjectRequirementModuleGroup[];
  total: number;
  /** 项目关联的全部产品与产品集：分组靠它的 product_is_set，没有需求的也从这里补出来 */
  productLinks: TProductProject[];
  isProductsLoading: boolean;
  selectedProductId: string | null;
  selectedModuleId: string | null;
  onSelect: (moduleId: string | null) => void;
  onSelectProduct: (productId: string | null) => void;
  /** 左栏搜索框的内容，由外壳持有 */
  query: string;
  /** 外壳「全部收起」按钮每点一次加一 */
  collapseSignal: number;
};

/**
 * 项目研发需求页左栏的树：「全部需求」→ 按「产品集 / 产品」分组的产品 → 模块。
 * 没有需求的产品就地灰显、计数为 0，排在本组末尾。
 *
 * 选中口径：点产品 = 只按产品筛；点模块 = 按模块筛，并带上它所属的产品。
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
    query: rawQuery,
    collapseSignal,
  } = props;
  const { t } = useTranslation();
  const [collapsedProductIds, setCollapsedProductIds] = useState<Set<string>>(() => new Set());
  const [expandedModuleIds, setExpandedModuleIds] = useState<Set<string>>(() => new Set());
  const query = rawQuery.trim().toLowerCase();

  const products = useMemo<TProjectRequirementTreeProduct[]>(() => {
    const linkById = new Map(productLinks.map((link) => [link.product, link]));
    const withRequirements = groups
      .filter((group) => group.total > 0)
      .map((group) => ({
        id: group.product_id,
        name: group.product_name || group.product_identifier,
        identifier: group.product_identifier,
        isSet: Boolean(linkById.get(group.product_id)?.product_is_set),
        total: group.total,
        modules: group.modules,
      }));
    if (isProductsLoading) return withRequirements;
    const seen = new Set(withRequirements.map((product) => product.id));
    const empty = productLinks
      .filter((link) => !seen.has(link.product))
      .map((link) => ({
        id: link.product,
        name: link.product_name || link.product_identifier,
        identifier: link.product_identifier,
        isSet: link.product_is_set,
        total: 0,
        modules: [],
      }));
    return [...withRequirements, ...empty];
  }, [groups, isProductsLoading, productLinks]);

  // 搜索：产品名 / 编号命中留整棵；否则只留命中的模块及其祖先，并强制展开
  const visible = useMemo(() => {
    if (!query) return { products, forcedExpandIds: null as Set<string> | null };
    const forced = new Set<string>();
    const result = products.flatMap((product) => {
      const productHit =
        product.name.toLowerCase().includes(query) || product.identifier.toLowerCase().includes(query);
      const { modules, expandIds } = filterModules(product.modules, query);
      if (modules.length > 0) {
        expandIds.forEach((id) => forced.add(id));
        return [{ ...product, modules }];
      }
      return productHit ? [product] : [];
    });
    return { products: result, forcedExpandIds: forced };
  }, [products, query]);

  // 选中的模块藏在收起的分支里时，把它所在的产品和祖先模块展开
  useEffect(() => {
    if (!selectedModuleId) return;
    const path = findModulePath(products, selectedModuleId);
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
  }, [products, selectedModuleId]);

  // 「全部收起」：产品和模块一起收
  useEffect(() => {
    if (!collapseSignal) return;
    setCollapsedProductIds(new Set(products.map((product) => product.id)));
    setExpandedModuleIds(new Set());
    // 只响应按钮，不随产品列表变化重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseSignal]);

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

  const isModuleExpanded = (id: string) => (visible.forcedExpandIds ? true : expandedModuleIds.has(id));
  const isProductExpanded = (id: string) => (visible.forcedExpandIds ? true : !collapsedProductIds.has(id));

  const renderModules = (productId: string, modules: TRequirementModule[], depth: number): ReactNode =>
    modules.map((item) => {
      const hasChildren = (item.children ?? []).length > 0;
      const isExpanded = isModuleExpanded(item.id);
      return (
        <Fragment key={item.id}>
          <TreeRow
            depth={depth}
            icon={<Folder className="size-3.5" />}
            label={<Highlight text={item.name} query={query} />}
            count={item.count}
            isActive={selectedModuleId === item.id}
            isExpanded={hasChildren ? isExpanded : undefined}
            toggleLabel={isExpanded ? collapseLabel : expandLabel}
            onToggle={visible.forcedExpandIds ? undefined : () => toggleIn(setExpandedModuleIds, item.id)}
            onSelect={() => {
              onSelect(item.id);
              onSelectProduct(productId);
            }}
          />
          {hasChildren && isExpanded && renderModules(productId, item.children, depth + 1)}
        </Fragment>
      );
    });

  const renderProduct = (product: TProjectRequirementTreeProduct) => {
    const hasModules = product.modules.length > 0;
    const isExpanded = isProductExpanded(product.id);
    return (
      <Fragment key={product.id}>
        <ProductRow
          product={product}
          query={query}
          isActive={selectedProductId === product.id && !selectedModuleId}
          isExpanded={hasModules ? isExpanded : undefined}
          toggleLabel={isExpanded ? collapseLabel : expandLabel}
          onToggle={() => toggleIn(setCollapsedProductIds, product.id)}
          onSelect={() => selectProduct(product.id)}
        />
        {hasModules && isExpanded && renderModules(product.id, product.modules, 1)}
      </Fragment>
    );
  };

  const productSets = visible.products.filter((product) => product.isSet);
  const plainProducts = visible.products.filter((product) => !product.isSet);

  return (
    <div className="flex flex-col gap-px">
      {!query && (
        <TreeRow
          depth={0}
          icon={<ListChecks className="size-3.5" />}
          label={t("requirement_modules.all")}
          count={total}
          isActive={!selectedProductId && !selectedModuleId}
          onSelect={() => selectProduct(null)}
        />
      )}

      {productSets.length > 0 && (
        <>
          <SectionLabel label={t("project_requirements.tree.group_sets")} count={productSets.length} />
          {productSets.map(renderProduct)}
        </>
      )}

      {plainProducts.length > 0 && (
        <>
          <SectionLabel label={t("project_requirements.tree.group_products")} count={plainProducts.length} />
          {plainProducts.map(renderProduct)}
        </>
      )}

      {query && visible.products.length === 0 && (
        <p className="px-2 py-6 text-center text-13 text-tertiary">{t("project_requirements.tree.no_match")}</p>
      )}
    </div>
  );
};
