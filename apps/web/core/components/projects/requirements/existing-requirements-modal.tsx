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
import { ISSUE_PRIORITIES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon, PriorityIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirement } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import useDebounce from "@/hooks/use-debounce";
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
  /** 各产品分面的总数缓存：切过去拉一次就记住，避免侧栏数字空白 */
  const [productCountByKey, setProductCountByKey] = useState<Record<string, number>>({});
  const [loadMoreElement, setLoadMoreElement] = useState<HTMLDivElement | null>(null);

  const optionsContainerRef = useRef<HTMLDivElement | null>(null);
  /**
   * 请求序号：搜索词变化很快，慢的那次响应可能后到并把新结果覆盖掉。
   * 只认最后一次发出的请求。
   */
  const requestSequenceRef = useRef(0);
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const handleClose = useCallback(() => {
    requestSequenceRef.current += 1;
    onClose();
    setSearchTerm("");
    setRows([]);
    setSelected([]);
    setPage(0);
    setHasMore(false);
    setTotalCount(0);
    setProductCountByKey({});
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
        if (reset) {
          setTotalCount(count);
          // 无搜索时才把总数记进分面；带搜索词的 count 不是全集口径
          if (!debouncedSearchTerm) {
            const key = productFilter ?? "__all__";
            setProductCountByKey((previous) => ({ ...previous, [key]: count }));
          }
        }
      } catch {
        if (requestSequence !== requestSequenceRef.current) return;
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

  /**
   * 打开弹窗时给左侧产品分面预取数量（无搜索词）。产品数通常很少，并行打几次
   * count 用的列表接口可接受；失败就让该行不显示数字，不影响主列表。
   */
  useEffect(() => {
    if (!isOpen || !workspaceSlug || !projectId || products.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        products.map(async (product) => {
          try {
            const response = await requirementService.listLinkableRequirements(workspaceSlug, projectId, {
              productId: product.id,
              perPage: 1,
              cursor: "1:0:0",
            });
            const count = response?.total_count ?? response?.total_results ?? response?.count ?? 0;
            return [product.id, count] as const;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      setProductCountByKey((previous) => {
        const next = { ...previous };
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, products, projectId, workspaceSlug]);

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
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.VXL}>
      <Combobox
        as="div"
        className="flex max-h-[min(80vh,640px)] flex-col"
        onChange={(row: TRequirement) => {
          setSelected((previous) =>
            previous.some((item) => item.id === row.id)
              ? previous.filter((item) => item.id !== row.id)
              : [...previous, row]
          );
        }}
      >
        {/* 顶栏：标题 + 副标题 + 关闭 */}
        <div className="flex items-start justify-between gap-3 border-b border-subtle px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-body-sm-semibold text-primary">{t("project_requirements.linkable.title")}</h3>
            <p className="mt-0.5 text-caption-sm-regular text-tertiary">
              {t("project_requirements.linkable.subtitle")}
            </p>
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
          {/* 左栏：产品分面，与数据行物理隔离 */}
          {showProductSidebar && (
            <aside className="flex w-44 shrink-0 flex-col border-r border-subtle bg-surface-1/60">
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
                  {typeof productCountByKey.__all__ === "number" && (
                    <span
                      className={cn(
                        "tabular-nums text-caption-sm-medium",
                        productFilter === undefined ? "text-accent-primary" : "text-placeholder"
                      )}
                    >
                      {productCountByKey.__all__}
                    </span>
                  )}
                </button>
                {products.map((product) => {
                  const isActive = productFilter === product.id;
                  const count = productCountByKey[product.id];
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
              ) : rows.length === 0 ? (
                <p className="px-2 py-10 text-center text-13 text-secondary">
                  {t("project_requirements.linkable.empty")}
                </p>
              ) : (
                <>
                  {rows.map((row) => {
                    const isSelected = selectedIds.has(row.id);
                    const priority = row.priority;
                    const priorityTitle =
                      priority && priority !== "none"
                        ? (ISSUE_PRIORITIES.find((item) => item.key === priority)?.title ?? priority)
                        : null;
                    return (
                      <Combobox.Option
                        key={row.id}
                        value={row}
                        className={({ active }) =>
                          cn(
                            "flex cursor-pointer items-start gap-2.5 rounded-md border-[0.5px] border-subtle bg-surface-1 px-3 py-2.5 text-13 text-primary select-none transition-colors",
                            active && "border-strong bg-layer-transparent-hover",
                            isSelected && "border-accent-strong bg-accent-primary/5"
                          )
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="pointer-events-none mt-0.5 size-3.5 shrink-0 accent-[var(--color-accent-primary)]"
                        />
                        <Layers className="mt-0.5 size-3.5 shrink-0 text-accent-primary" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {row.display_id && <RequirementIdentifier displayId={row.display_id} />}
                            <Tooltip tooltipContent={row.title}>
                              <span className="min-w-0 truncate text-body-xs-medium text-primary">{row.title}</span>
                            </Tooltip>
                          </div>
                          {(row.target_date || priorityTitle) && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-caption-sm-regular text-tertiary">
                              {row.target_date && <span>{renderFormattedDate(row.target_date)}</span>}
                              {priorityTitle && priority && (
                                <span className="inline-flex items-center gap-1">
                                  <PriorityIcon priority={priority} size={12} className="shrink-0" />
                                  <span>{priorityTitle}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </Combobox.Option>
                    );
                  })}
                  <div ref={setLoadMoreElement} className="h-1" />
                  {isLoadingMore && (
                    <p className="px-2 py-2 text-center text-11 text-secondary">{t("loading")}</p>
                  )}
                </>
              )}
            </Combobox.Options>
          </div>

          {/* 右栏：已选清单 */}
          <aside className="flex w-48 shrink-0 flex-col border-l border-subtle bg-surface-1/60">
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
            {t("project_requirements.linkable.selected_items", { count: selected.length })}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleClose}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isSubmitting}
              disabled={!selected.length || isSubmitting}
              onClick={() => void handleSubmit()}
            >
              {t("project_requirements.linkable.confirm_submit")}
            </Button>
          </div>
        </div>
      </Combobox>
    </ModalCore>
  );
};
