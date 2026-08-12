/**
 * 「关联需求」弹窗：从候选池里挑需求进本项目。
 *
 * 三栏布局：左产品分面 · 中搜索+候选列表 · 右已选清单。候选池只包含**已关联产品下、
 * 且已通过评审**的需求，规则由服务端保证（linkable_requirements_queryset），前端
 * 不再二次过滤。
 *
 * 交互仍是 Combobox 多选 + 防抖搜索 + 无限滚动 + 请求序号防串台（与工作项
 * ExistingIssuesListModal 同套路），只是把产品和已选从数据行里拆到两侧栏。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Combobox } from "@headlessui/react";
import { Layers, Package } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TLinkableRequirementFacets, TRequirement } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();
const PAGE_SIZE = 50;

type TProps = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  /** 本项目已关联的产品。候选池就是从这些产品里来的，也是左侧分面的选项 */
  products: { id: string; name: string; identifier: string }[];
  handleClose: () => void;
  /** 返回后由调用方负责刷新列表 */
  onSubmit: (requirementIds: string[]) => Promise<void>;
};

export const ExistingRequirementsModal = (props: TProps) => {
  const { isOpen, workspaceSlug, projectId, products, handleClose: onClose, onSubmit } = props;
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState("");
  const [productFilter, setProductFilter] = useState<string | undefined>();
  const [rows, setRows] = useState<TRequirement[]>([]);
  const [selected, setSelected] = useState<TRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  /** 左侧分面计数：全集口径，服务端搭每次列表响应的 extra_stats 一起返回 */
  const [facetCounts, setFacetCounts] = useState<TLinkableRequirementFacets | null>(null);
  /** 列表拉取失败：区分「候选池真是空的」和「接口挂了」，别把故障说成空数据 */
  const [loadError, setLoadError] = useState(false);
  const [loadMoreElement, setLoadMoreElement] = useState<HTMLDivElement | null>(null);

  const optionsContainerRef = useRef<HTMLDivElement | null>(null);
  /** 打开时聚焦搜索框。不指定的话焦点落在顶栏关闭按钮上，回车会直接关弹窗 */
  const searchInputRef = useRef<HTMLElement | null>(null);
  /**
   * 请求序号：搜索词变化很快，慢的那次响应可能后到并把新结果覆盖掉。
   * 只认最后一次发出的请求。
   */
  const requestSequenceRef = useRef(0);
  // 防抖不走共享 hook：关闭时要能立刻清掉防抖值，否则 500ms 内重开会带着旧搜索词发请求
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearchTerm(searchTerm), 500);
    return () => clearTimeout(timeout);
  }, [searchTerm]);

  const handleClose = useCallback(() => {
    requestSequenceRef.current += 1;
    onClose();
    setSearchTerm("");
    setDebouncedSearchTerm("");
    setRows([]);
    setSelected([]);
    setPage(0);
    setHasMore(false);
    setTotalCount(0);
    setFacetCounts(null);
    setLoadError(false);
    setIsLoading(false);
    setIsLoadingMore(false);
    setProductFilter(undefined);
  }, [onClose]);

  const fetchRows = useCallback(
    // nextPage 是**页序号**，不是行偏移。后端游标的形状是 "limit:page:is_prev"
    // （见 utils/paginator.py 的 Cursor），第 0 页就是 "50:0:0"。
    async ({ reset, nextPage }: { reset: boolean; nextPage: number }) => {
      if (!isOpen || !workspaceSlug || !projectId) return;
      const requestSequence = ++requestSequenceRef.current;

      setLoadError(false);
      if (reset) {
        setIsLoading(true);
        setHasMore(false);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const response = await requirementService.listLinkableRequirements(workspaceSlug, projectId, {
          search: debouncedSearchTerm,
          productId: productFilter,
          perPage: PAGE_SIZE,
          cursor: `${PAGE_SIZE}:${nextPage}:0`,
        });
        if (requestSequence !== requestSequenceRef.current) return;

        const results = response?.results ?? [];
        const count = response?.total_count ?? response?.total_results ?? response?.count ?? results.length;
        setRows((previous) => (reset ? results : [...previous, ...results]));
        setPage(nextPage);
        setHasMore(Boolean(response?.next_page_results));
        if (reset) setTotalCount(count);
        // 分面计数是全集口径（不随搜索/筛选变化），服务端每次响应都带，直接覆盖
        if (response?.extra_stats) setFacetCounts(response.extra_stats);
      } catch {
        if (requestSequence !== requestSequenceRef.current) return;
        setLoadError(true);
        if (reset) {
          setRows([]);
          setTotalCount(0);
        }
        setHasMore(false);
      } finally {
        if (requestSequence === requestSequenceRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [debouncedSearchTerm, isOpen, productFilter, projectId, workspaceSlug]
  );

  useEffect(() => {
    if (!isOpen) return;
    void fetchRows({ reset: true, nextPage: 0 });
  }, [fetchRows, isOpen]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || isLoadingMore) return;
    void fetchRows({ reset: false, nextPage: page + 1 });
  }, [fetchRows, hasMore, isLoading, isLoadingMore, page]);

  useIntersectionObserver(optionsContainerRef, loadMoreElement, loadMore, "0px 0px 120px 0px");

  const selectedIds = useMemo(() => new Set(selected.map((row) => row.id)), [selected]);

  const removeSelected = useCallback((requirementId: string) => {
    setSelected((previous) => previous.filter((item) => item.id !== requirementId));
  }, []);

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

  const showProductSidebar = products.length > 0;

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXXL}
      initialFocus={searchInputRef}
    >
      <Combobox
        as="div"
        // 固定视口高度：避免条目少时又宽又扁；宽度用 4xl，比原先 5xl 收一档
        className="flex h-[min(86vh,720px)] flex-col"
        onChange={(row: TRequirement) => {
          setSelected((previous) =>
            previous.some((item) => item.id === row.id)
              ? previous.filter((item) => item.id !== row.id)
              : [...previous, row]
          );
        }}
      >
        {/* 顶栏：标题 + 副标题 + 关闭 */}
        <div className="flex items-center justify-between gap-3 border-b border-subtle px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-body-sm-semibold text-primary">{t("project_requirements.linkable.title")}</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("close")}
            className="grid size-7 shrink-0 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
          >
            <CloseIcon className="size-3.5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 左栏：产品分面，与数据行物理隔离。窄屏（<sm）收起，退回单列布局 */}
          {showProductSidebar && (
            <aside className="hidden w-44 shrink-0 flex-col border-r border-subtle bg-surface-2 sm:flex">
              <div className="px-3 pt-3 pb-1.5 text-caption-sm-medium text-tertiary">
                {t("project_requirements.linkable.products_label")}
              </div>
              <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
                <button
                  type="button"
                  onClick={() => setProductFilter(undefined)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-13 transition-colors",
                    productFilter === undefined
                      ? "bg-accent-primary/10 text-accent-primary"
                      : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                  )}
                >
                  <span
                    className={cn(
                      "w-0.5 self-stretch rounded-full",
                      productFilter === undefined ? "bg-accent-primary" : "bg-transparent"
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{t("project_requirements.all_products")}</span>
                  {facetCounts && (
                    <span
                      className={cn(
                        "tabular-nums text-caption-sm-medium",
                        productFilter === undefined ? "text-accent-primary" : "text-placeholder"
                      )}
                    >
                      {facetCounts.total}
                    </span>
                  )}
                </button>
                {products.map((product) => {
                  const isActive = productFilter === product.id;
                  // 没有候选的产品不出现在 by_product 里，显示 0 比空白更明确
                  const count = facetCounts ? (facetCounts.by_product[product.id] ?? 0) : undefined;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => setProductFilter(product.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-13 transition-colors",
                        isActive
                          ? "bg-accent-primary/10 text-accent-primary"
                          : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                      )}
                    >
                      <span
                        className={cn(
                          "w-0.5 self-stretch rounded-full",
                          isActive ? "bg-accent-primary" : "bg-transparent"
                        )}
                        aria-hidden
                      />
                      <Package className="size-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate" title={product.name}>
                        {product.name || product.identifier}
                      </span>
                      {typeof count === "number" && (
                        <span
                          className={cn(
                            "tabular-nums text-caption-sm-medium",
                            isActive ? "text-accent-primary" : "text-placeholder"
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </aside>
          )}

          {/* 中栏：搜索 + 候选列表 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-subtle px-4 py-3">
              <div className="relative">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-secondary"
                  aria-hidden="true"
                />
                <Combobox.Input
                  ref={(element: HTMLInputElement | null) => {
                    searchInputRef.current = element;
                  }}
                  className="h-9 w-full rounded-md border-[0.5px] border-strong bg-surface-1 pr-9 pl-9 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-primary"
                  placeholder={t("project_requirements.linkable.search_placeholder")}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    aria-label={t("common.clear")}
                    onClick={() => setSearchTerm("")}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-secondary hover:bg-layer-2 hover:text-primary"
                  >
                    <CloseIcon className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-2 text-caption-sm-regular text-tertiary">
                {t("project_requirements.linkable.total_count", { count: totalCount })}
              </p>
            </div>

            <Combobox.Options
              static
              as="div"
              ref={optionsContainerRef}
              className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3"
            >
              {isLoading ? (
                <Loader className="space-y-2">
                  <Loader.Item height="56px" />
                  <Loader.Item height="56px" />
                  <Loader.Item height="56px" />
                </Loader>
              ) : loadError && rows.length === 0 ? (
                // 接口挂了 ≠ 候选池是空的：给错误态和重试入口，别误导用户去重配产品关联
                <div className="flex flex-col items-center gap-2.5 px-2 py-10">
                  <p className="text-13 text-secondary">{t("project_requirements.linkable.load_failed")}</p>
                  <Button variant="secondary" size="sm" onClick={() => void fetchRows({ reset: true, nextPage: 0 })}>
                    {t("retry")}
                  </Button>
                </div>
              ) : rows.length === 0 ? (
                <p className="px-2 py-10 text-center text-13 text-secondary">
                  {t("project_requirements.linkable.empty")}
                </p>
              ) : (
                <>
                  {rows.map((row) => {
                    const isSelected = selectedIds.has(row.id);
                    return (
                      <Combobox.Option
                        key={row.id}
                        value={row}
                        className={({ active }) =>
                          cn(
                            "flex cursor-pointer items-center gap-2.5 rounded-md border-[0.5px] border-subtle bg-surface-1 px-3 py-2.5 text-13 text-primary select-none transition-colors",
                            active && "border-strong bg-layer-transparent-hover",
                            isSelected && "border-accent-strong bg-accent-primary/5"
                          )
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="pointer-events-none size-3.5 shrink-0 accent-[var(--bg-accent-primary)]"
                        />
                        <Layers className="size-3.5 shrink-0 text-accent-primary" aria-hidden />
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          {row.display_id && <RequirementIdentifier displayId={row.display_id} />}
                          <Tooltip tooltipContent={row.title}>
                            <span className="min-w-0 truncate text-body-xs-medium text-primary">{row.title}</span>
                          </Tooltip>
                        </div>
                      </Combobox.Option>
                    );
                  })}
                  <div ref={setLoadMoreElement} className="h-1" />
                  {isLoadingMore && (
                    <p className="px-2 py-2 text-center text-11 text-secondary">{t("loading")}</p>
                  )}
                  {loadError && (
                    // 加载更多失败：列表被截断了，明说并给重试，别装作已经到底
                    <div className="flex items-center justify-center gap-2 px-2 py-2">
                      <span className="text-11 text-secondary">{t("project_requirements.linkable.load_failed")}</span>
                      <button
                        type="button"
                        onClick={() => void fetchRows({ reset: false, nextPage: page + 1 })}
                        className="text-11 text-accent-primary hover:underline"
                      >
                        {t("retry")}
                      </button>
                    </div>
                  )}
                </>
              )}
            </Combobox.Options>
          </div>

          {/* 右栏：已选清单。窄屏（<sm）收起，已选数量看底栏 */}
          <aside className="hidden w-48 shrink-0 flex-col border-l border-subtle bg-surface-2 sm:flex">
            <div className="flex items-center justify-between gap-2 border-b border-subtle px-3 py-3">
              <span className="text-caption-sm-medium text-tertiary">
                {t("project_requirements.linkable.selected_panel")}
              </span>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="text-caption-sm-medium text-accent-primary hover:underline"
                >
                  {t("common.clear")}
                </button>
              )}
            </div>
            <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 py-2">
              {selected.length === 0 ? (
                <p className="px-1 py-6 text-center text-caption-sm-regular text-placeholder">
                  {t("project_requirements.linkable.selected_empty")}
                </p>
              ) : (
                selected.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-start gap-1.5 rounded-md border-[0.5px] border-subtle bg-surface-1 px-2 py-1.5"
                  >
                    <Layers className="mt-0.5 size-3 shrink-0 text-accent-primary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      {row.display_id && (
                        <div className="truncate text-caption-sm-medium text-secondary">{row.display_id}</div>
                      )}
                      <Tooltip tooltipContent={row.title}>
                        <div className="truncate text-caption-sm-regular text-primary">{row.title}</div>
                      </Tooltip>
                    </div>
                    <button
                      type="button"
                      aria-label={t("common.remove")}
                      onClick={() => removeSelected(row.id)}
                      className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
                    >
                      <CloseIcon className="size-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-subtle px-5 py-3">
          <span className="text-caption-sm-regular text-tertiary">
            {t("project_requirements.linkable.selected", { count: selected.length })}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="lg" onClick={handleClose}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={isSubmitting}
              disabled={!selected.length || isSubmitting}
              onClick={() => void handleSubmit()}
            >
              {t("confirm")}
            </Button>
          </div>
        </div>
      </Combobox>
    </ModalCore>
  );
};
