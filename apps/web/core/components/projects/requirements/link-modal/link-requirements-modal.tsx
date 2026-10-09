/**
 * 「关联研发需求」弹窗：左侧按产品分组的候选表格，右侧已选栏。
 *
 * 候选池是当前用户看得见的全部产品下、尚未关联进本项目的需求（服务端 linkable_requirements_queryset）。
 * 已关联本项目的产品排在前面、默认展开；其他产品放在后面一组、默认折叠，勾了它们的需求，
 * 提交时服务端会把产品一并关联进本项目。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Link2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProduct, TRequirement } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { ProductPickTile } from "@/components/projects/products/project-products-table";
import { useRequirementTypes } from "@/hooks/store/use-requirement-types";
import { LINK_ROW_GRID, LinkRequirementsGroup } from "./link-requirements-group";
import type { TLinkGroupProduct } from "./link-requirements-group";
import { LinkRequirementsFilter } from "./link-requirements-filter";
import { LinkRequirementsSelectedRail } from "./link-requirements-selected-rail";
import type { TSelectedRailGroup } from "./link-requirements-selected-rail";
import { useLinkableRequirementGroups } from "./use-linkable-requirement-groups";

/** 有搜索词或类型筛选时默认展开的组数上限：每展开一组就多一次请求 */
const MAX_AUTO_EXPANDED = 10;
const SELECT_ALL_KEY = "__all__";

type TProps = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  /** 当前用户看得见的工作区产品：分组名称、图标都从这里取 */
  products: TProduct[];
  linkedProductIds: ReadonlySet<string>;
  handleClose: () => void;
  /** 返回后由调用方负责刷新列表与产品关联 */
  onSubmit: (requirementIds: string[]) => Promise<void>;
  /** 页脚「没找到想要的需求？提研发需求」 */
  onCreate: () => void;
};

export const LinkRequirementsModal = (props: TProps) => {
  const { isOpen, workspaceSlug, projectId, products, linkedProductIds, handleClose: onClose, onSubmit, onCreate } =
    props;
  const { t } = useTranslation();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = useState<TRequirement[]>([]);
  /** 正在为整组 / 全部勾选拉行：组的 product_id，或 SELECT_ALL_KEY */
  const [selectingKey, setSelectingKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /**
   * 第几次打开。弹窗关掉并不卸载，整组勾选的请求可能在关掉之后才回来 ——
   * 对不上当前这一轮就丢掉，否则重开时会冒出上一轮没完成的勾选。
   */
  const sessionRef = useRef(0);

  // 防抖不走共享 hook：关闭时要能立刻清掉防抖值，否则重开会带着旧搜索词发请求
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 400);
    return () => clearTimeout(timeout);
  }, [searchTerm]);

  const { facets, isFacetsLoading, facetsError, groups, loadGroup, fetchAll, reload } = useLinkableRequirementGroups({
    isOpen,
    workspaceSlug,
    projectId,
    search: debouncedSearch,
    requirementTypeId: typeFilter,
  });
  const { requirementTypes } = useRequirementTypes(isOpen ? workspaceSlug : undefined);

  const handleClose = useCallback(() => {
    sessionRef.current += 1;
    onClose();
    setSearchTerm("");
    setDebouncedSearch("");
    setProductFilter(null);
    setTypeFilter(null);
    setExpanded(new Set());
    setSelected([]);
    setSelectingKey(null);
  }, [onClose]);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const toGroupProduct = useCallback(
    (productId: string): TLinkGroupProduct => {
      const product = productById.get(productId);
      return {
        id: productId,
        name: product?.name ?? "",
        identifier: product?.identifier ?? "",
        logoProps: product?.logo_props ?? null,
      };
    },
    [productById]
  );

  /** 分组顺序与服务端一致：已关联本项目的产品在前，再按开发编号 */
  const allGroupIds = useMemo(() => {
    const ids = Object.keys(facets?.by_product ?? {});
    const rank = (id: string) => (linkedProductIds.has(id) ? 0 : 1);
    return ids.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (productById.get(a)?.identifier ?? "").localeCompare(productById.get(b)?.identifier ?? "", "zh-CN")
    );
  }, [facets, linkedProductIds, productById]);
  const visibleGroupIds = useMemo(
    () => (productFilter ? allGroupIds.filter((id) => id === productFilter) : allGroupIds),
    [allGroupIds, productFilter]
  );
  const linkedGroupIds = visibleGroupIds.filter((id) => linkedProductIds.has(id));
  const otherGroupIds = visibleGroupIds.filter((id) => !linkedProductIds.has(id));

  /**
   * 分组名单一换（打开、改搜索词或类型）就重算默认展开：有搜索 / 类型时把命中的组都打开，
   * 否则只开已关联本项目的组；一个都没关联时开第一组。
   */
  useEffect(() => {
    if (!facets) return;
    const ids = allGroupIds;
    if (debouncedSearch || typeFilter) {
      setExpanded(new Set(ids.slice(0, MAX_AUTO_EXPANDED)));
      return;
    }
    const linkedIds = ids.filter((id) => linkedProductIds.has(id));
    setExpanded(new Set(linkedIds.length > 0 ? linkedIds : ids.slice(0, 1)));
    // 只在分组名单换代时重算，用户手动展开 / 收起之后不要被冲掉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facets]);

  const isExpanded = useCallback(
    (productId: string) => productFilter === productId || expanded.has(productId),
    [expanded, productFilter]
  );

  useEffect(() => {
    for (const productId of visibleGroupIds) {
      if (isExpanded(productId) && !groups[productId]) void loadGroup(productId);
    }
  }, [groups, isExpanded, loadGroup, visibleGroupIds]);

  const toggleExpanded = (productId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });

  const selectedIds = useMemo(() => new Set(selected.map((row) => row.id)), [selected]);
  const selectedCountByProduct = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of selected) {
      if (row.product_id) counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + 1);
    }
    return counts;
  }, [selected]);

  const toggleRow = (row: TRequirement) =>
    setSelected((current) =>
      current.some((item) => item.id === row.id) ? current.filter((item) => item.id !== row.id) : [...current, row]
    );
  /** 一批候选（当前搜索 / 类型下的整组或全部）：已经全选就只去掉这一批，否则补上没选的；筛选外已勾的不动 */
  const toggleRows = (rows: TRequirement[]) =>
    setSelected((current) => {
      const ids = new Set(current.map((item) => item.id));
      if (rows.length > 0 && rows.every((row) => ids.has(row.id))) {
        const drop = new Set(rows.map((row) => row.id));
        return current.filter((item) => !drop.has(item.id));
      }
      return [...current, ...rows.filter((row) => !ids.has(row.id))];
    });

  /**
   * 有搜索词或类型筛选时，组里的条数是筛选后的，不能拿这个产品下全部已选去比 ——
   * 先选了 A、再搜到只剩同产品的 B，按产品计数会误判成「已全选」。这时只数组里已加载、
   * 且在当前结果中的已选行；没筛选时组内候选就是这个产品的全部候选，按产品计数是准的。
   */
  const hasRowFilter = Boolean(debouncedSearch || typeFilter);
  const selectedInGroup = (productId: string) =>
    hasRowFilter
      ? (groups[productId]?.rows.filter((row) => selectedIds.has(row.id)).length ?? 0)
      : (selectedCountByProduct.get(productId) ?? 0);

  const runBulkToggle = async (key: string, load: () => Promise<TRequirement[]>) => {
    const session = sessionRef.current;
    setSelectingKey(key);
    try {
      const rows = await load();
      if (session !== sessionRef.current) return;
      toggleRows(rows);
    } catch {
      if (session !== sessionRef.current) return;
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("project_requirements.linkable.load_failed") });
    } finally {
      if (session === sessionRef.current) setSelectingKey(null);
    }
  };

  const visibleTotal = visibleGroupIds.reduce((sum, id) => sum + (facets?.by_product[id] ?? 0), 0);
  const visibleSelected = visibleGroupIds.reduce((sum, id) => sum + selectedInGroup(id), 0);
  const isAllSelected = visibleTotal > 0 && visibleSelected >= visibleTotal;

  const toggleGroup = (productId: string) => {
    // 没筛选时整组已全选：按产品去掉即可，不必再拉一遍
    if (!hasRowFilter && selectedInGroup(productId) >= (facets?.by_product[productId] ?? 0)) {
      setSelected((current) => current.filter((row) => row.product_id !== productId));
      return;
    }
    void runBulkToggle(productId, () => fetchAll(productId));
  };

  const toggleAll = () => {
    if (!hasRowFilter && isAllSelected) {
      const scope = new Set(visibleGroupIds);
      setSelected((current) => current.filter((row) => !row.product_id || !scope.has(row.product_id)));
      return;
    }
    void runBulkToggle(SELECT_ALL_KEY, () => fetchAll(productFilter ?? undefined));
  };

  /** 右栏按左侧分组顺序排；不在当前结果里的已选（换了搜索词）排在最后 */
  const railGroups = useMemo<TSelectedRailGroup[]>(() => {
    const byProduct = new Map<string, TRequirement[]>();
    for (const row of selected) {
      const key = row.product_id ?? "";
      byProduct.set(key, [...(byProduct.get(key) ?? []), row]);
    }
    const order = [...allGroupIds, ...[...byProduct.keys()].filter((id) => !allGroupIds.includes(id))];
    return order
      .filter((id) => byProduct.has(id))
      .map((id) => ({ product: toGroupProduct(id), isLinked: linkedProductIds.has(id), rows: byProduct.get(id) ?? [] }));
  }, [allGroupIds, linkedProductIds, selected, toGroupProduct]);

  const productsToLink = railGroups.filter((group) => !group.isLinked).length;

  const handleSubmit = async () => {
    if (!selected.length) return;
    setIsSubmitting(true);
    try {
      await onSubmit(selected.map((row) => row.id));
      handleClose();
    } catch (error) {
      const payload = error as { error?: string } | null;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("project_requirements.toast.failed"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const productFilterGroups = useMemo(() => {
    const toOption = (id: string) => {
      const product = toGroupProduct(id);
      return {
        id,
        label: product.name || product.identifier,
        suffix: product.identifier,
        leading: <ProductPickTile logoProps={product.logoProps} size="xs" />,
        count: facets?.by_product[id] ?? 0,
      };
    };
    const linked = allGroupIds.filter((id) => linkedProductIds.has(id));
    const others = allGroupIds.filter((id) => !linkedProductIds.has(id));
    return [
      { key: "linked", title: t("project_requirements.linkable.group_linked"), options: linked.map(toOption) },
      { key: "others", title: t("project_requirements.linkable.group_others"), options: others.map(toOption) },
    ].filter((group) => group.options.length > 0);
  }, [allGroupIds, facets, linkedProductIds, t, toGroupProduct]);

  const typeFilterGroups = useMemo(
    () => [
      {
        key: "types",
        options: requirementTypes
          .filter((requirementType) => requirementType.is_active)
          .map((requirementType) => ({ id: requirementType.id, label: requirementType.name })),
      },
    ],
    [requirementTypes]
  );
  const typeNames = useMemo(
    () => new Map(requirementTypes.map((requirementType) => [requirementType.id, requirementType.name])),
    [requirementTypes]
  );

  const hasQuery = Boolean(debouncedSearch || typeFilter || productFilter);
  const hasNoLinkedProducts = linkedProductIds.size === 0;

  const renderGroup = (productId: string) => (
    <LinkRequirementsGroup
      key={productId}
      product={toGroupProduct(productId)}
      total={facets?.by_product[productId] ?? 0}
      selectedCount={selectedInGroup(productId)}
      isExpanded={isExpanded(productId)}
      isSelecting={selectingKey === productId || selectingKey === SELECT_ALL_KEY}
      state={groups[productId]}
      selectedIds={selectedIds}
      typeNames={typeNames}
      onToggleExpand={() => toggleExpanded(productId)}
      onToggleGroup={() => toggleGroup(productId)}
      onToggleRow={toggleRow}
      // 首屏失败重拉第一页；翻页失败接着已加载的页往下拉
      onLoadMore={() => void loadGroup(productId, { more: (groups[productId]?.rows.length ?? 0) > 0 })}
    />
  );

  const renderBody = () => {
    if (isFacetsLoading && !facets) {
      return (
        <Loader className="space-y-2 px-5 pt-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Loader.Item key={index} height="52px" />
          ))}
        </Loader>
      );
    }
    if (facetsError) {
      return (
        <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-13 text-secondary">
          {t("project_requirements.linkable.load_failed")}
          <Button variant="secondary" size="sm" onClick={reload}>
            {t("retry")}
          </Button>
        </div>
      );
    }
    if (visibleGroupIds.length === 0) {
      if (hasQuery) {
        return (
          <div className="flex h-full min-h-64 items-center justify-center text-14 text-tertiary">
            {t("project_requirements.linkable.filtered_empty")}
          </div>
        );
      }
      return (
        <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 pb-12 text-center">
          <div className="grid size-16 place-items-center rounded-2xl border border-subtle bg-layer-1 text-placeholder">
            <CheckCircle2 className="size-7.5" strokeWidth={1.5} />
          </div>
          <p className="mt-5 text-16 font-semibold text-primary">{t("project_requirements.linkable.empty_title")}</p>
          <p className="mt-2 max-w-md text-14 leading-6 text-tertiary">
            {t("project_requirements.linkable.empty_description")}
          </p>
          <Button
            variant="primary"
            size="lg"
            className="mt-5"
            onClick={() => {
              handleClose();
              onCreate();
            }}
          >
            {t("project_requirements.create")}
          </Button>
        </div>
      );
    }
    return (
      <div className="min-w-[38rem]">
        <div
          className={cn(
            LINK_ROW_GRID,
            "sticky top-0 z-[2] h-9.5 border-b border-subtle bg-surface-1 text-12 font-medium text-tertiary"
          )}
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={isAllSelected ? true : visibleSelected > 0 ? "mixed" : false}
            aria-label={t("project_requirements.linkable.select_all")}
            disabled={selectingKey !== null}
            onClick={toggleAll}
            className="flex disabled:cursor-wait"
          >
            <span className="pointer-events-none flex">
              <Checkbox
                checked={isAllSelected}
                indeterminate={!isAllSelected && visibleSelected > 0}
                readOnly
                tabIndex={-1}
              />
            </span>
          </button>
          <span>{t("requirements.identifier.column")}</span>
          <span>{t("requirement_fields.builtin.title")}</span>
          <span>{t("requirement_fields.builtin.status")}</span>
          <span>{t("requirement_approval.column")}</span>
        </div>
        {linkedGroupIds.map(renderGroup)}
        {linkedGroupIds.length > 0 && otherGroupIds.length > 0 && (
          <div className="flex h-9.5 items-center gap-2.5 border-b border-subtle bg-surface-1 px-5 text-12">
            <span className="font-semibold text-secondary">{t("project_requirements.linkable.group_others")}</span>
            <span className="truncate text-placeholder">{t("project_requirements.linkable.others_divider_hint")}</span>
          </div>
        )}
        {otherGroupIds.map(renderGroup)}
      </div>
    );
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXXL}
      className="rounded-2xl sm:max-w-[71rem]"
      initialFocus={searchInputRef}
    >
      <div className="flex h-[min(90vh,48.75rem)] min-h-0 flex-col">
        <div className="flex shrink-0 items-start gap-4 border-b border-subtle px-6 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-18 font-semibold text-primary">{t("project_requirements.linkable.title")}</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("close")}
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        {/* 宽屏左右两栏；窄屏已选栏落到表格下方 */}
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_13rem] lg:grid-cols-[minmax(0,1fr)_19.5rem] lg:grid-rows-[minmax(0,1fr)]">
          <section className="flex min-h-0 min-w-0 flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-6 py-4">
              <label className="flex h-10 w-full items-center gap-2 rounded-[10px] border border-subtle-1 bg-surface-1 px-3.5 focus-within:border-accent-strong sm:w-72">
                <SearchIcon className="size-4 shrink-0 text-placeholder" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={t("project_requirements.linkable.search_placeholder")}
                  className="min-w-0 flex-1 bg-transparent text-14 text-primary outline-none placeholder:text-placeholder"
                />
                {searchTerm && (
                  <button
                    type="button"
                    aria-label={t("project_products.search_clear")}
                    onClick={() => setSearchTerm("")}
                    className="grid size-5 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
                  >
                    <CloseIcon className="size-3.5" />
                  </button>
                )}
              </label>
              <LinkRequirementsFilter
                label={t("project_requirements.linkable.product_filter")}
                allLabel={t("project_requirements.linkable.all_products")}
                allCount={facets?.total}
                value={productFilter}
                groups={productFilterGroups}
                searchPlaceholder={t("project_requirements.linkable.search_products")}
                onChange={setProductFilter}
              />
              <LinkRequirementsFilter
                label={t("project_requirements.linkable.type_filter")}
                allLabel={t("project_requirements.linkable.all_types")}
                value={typeFilter}
                groups={typeFilterGroups}
                searchPlaceholder={t("project_requirements.linkable.search_types")}
                onChange={setTypeFilter}
              />
              {facets && (
                <span className="ml-auto text-13 whitespace-nowrap text-tertiary">
                  {t("project_requirements.linkable.total_count", { count: visibleTotal })}
                </span>
              )}
            </div>
            {hasNoLinkedProducts && visibleGroupIds.length > 0 && (
              <div className="shrink-0 px-6 pb-4">
                <div className="flex items-start gap-2 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2.5 text-13 leading-5 text-primary">
                  <Link2 className="mt-0.5 size-4 shrink-0 text-warning-primary" />
                  {t("project_requirements.linkable.auto_link_notice")}
                </div>
              </div>
            )}
            <div
              data-modal-wheel-scroll
              className="vertical-scrollbar horizontal-scrollbar scrollbar-sm min-h-0 flex-1 overflow-auto border-t border-subtle"
            >
              {renderBody()}
            </div>
          </section>

          <LinkRequirementsSelectedRail
            groups={railGroups}
            count={selected.length}
            onRemove={(requirementId) => setSelected((current) => current.filter((row) => row.id !== requirementId))}
            onClear={() => setSelected([])}
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-subtle px-6 py-3.5">
          <div className="flex min-w-0 items-center gap-2 text-13 text-tertiary">
            <span>{t("project_requirements.linkable.not_found")}</span>
            <button
              type="button"
              onClick={() => {
                handleClose();
                onCreate();
              }}
              className="font-medium text-accent-primary hover:text-accent-secondary"
            >
              {t("project_requirements.create")}
            </button>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2.5">
            {selected.length > 0 && (
              <span className="truncate text-13 text-tertiary">
                {productsToLink > 0
                  ? t("project_requirements.linkable.summary_with_link", {
                      count: selected.length,
                      products: productsToLink,
                    })
                  : t("project_requirements.linkable.summary", {
                      count: selected.length,
                      products: railGroups.length,
                    })}
              </span>
            )}
            <Button variant="secondary" size="lg" onClick={handleClose}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={isSubmitting}
              disabled={!selected.length || isSubmitting || selectingKey !== null}
              onClick={() => void handleSubmit()}
            >
              {selected.length > 0
                ? t("project_requirements.linkable.submit_count", { count: selected.length })
                : t("project_requirements.linkable.submit")}
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
};
