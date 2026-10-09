/**
 * 「关联产品」弹窗：左侧产品表格（按名称 / 开发编号搜索、按项目代号筛选），右侧已选产品栏。
 *
 * 这一步是整条链路的入口：需求来自产品，项目必须先关联产品，候选池才有东西。
 * 候选项是当前用户看得见的工作区产品；后端会再校验可见性与同工作区。
 * 打开时默认只看与本项目项目代号相同的产品（两边都存 project_code 字典的 label，按字符串相等匹配）。
 */
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PackageSearch } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProduct, TProductProject } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import type { TProductPickItem, TProductPickState } from "./picker-items";
import { buildLinkOnlyItems, buildProductPickItems, getProductPickState } from "./picker-items";
import { ProjectProductsCodeFilter } from "./project-products-code-filter";
import { ProjectProductsSelectedRail } from "./project-products-selected-rail";
import { ProjectProductsTable } from "./project-products-table";

type TProps = {
  isOpen: boolean;
  /** 工作区里当前用户可见的产品 */
  products: TProduct[];
  isProductsLoading: boolean;
  /** 本项目已关联的产品 */
  links: TProductProject[];
  /** 本项目的项目代号；没填时为空串，此时默认不筛选 */
  projectCode: string;
  isSubmitting: boolean;
  handleClose: () => void;
  onSubmit: (payload: { products: string[]; removed_products: string[] }) => Promise<void>;
};

const matchesQuery = (item: TProductPickItem, query: string) => {
  if (!query) return true;
  return `${item.name} ${item.identifier}`.toLowerCase().includes(query);
};

const EmptyBlock = ({ title, description, action }: { title: string; description?: string; action?: ReactNode }) => (
  <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 pb-12 text-center">
    <div className="grid size-16 place-items-center rounded-2xl border border-subtle bg-layer-1 text-placeholder">
      <PackageSearch className="size-7.5" strokeWidth={1.5} />
    </div>
    <p className="mt-5 text-16 font-semibold text-primary">{title}</p>
    {description && <p className="mt-2 text-14 text-tertiary">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const ProjectProductsModal = (props: TProps) => {
  const { isOpen, products, isProductsLoading, links, projectCode, isSubmitting, handleClose, onSubmit } = props;
  const { t } = useTranslation();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const linkedIds = useMemo(() => links.map((link) => link.product), [links]);
  const [selectedIds, setSelectedIds] = useState<string[]>(linkedIds);
  const [searchQuery, setSearchQuery] = useState("");
  const [codeFilter, setCodeFilter] = useState<string | null>(projectCode || null);

  // 每次打开都以服务端的现状为准，不要沿用上一次关掉时的草稿选择和筛选
  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(linkedIds);
    setSearchQuery("");
    setCodeFilter(projectCode || null);
  }, [isOpen, linkedIds, projectCode]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const items = useMemo(() => buildProductPickItems(products, links), [products, links]);
  const linkOnlyItems = useMemo(() => buildLinkOnlyItems(products, links), [products, links]);

  const codeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (item.code) counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const query = searchQuery.trim().toLowerCase();
  const filteredItems = useMemo(
    () => items.filter((item) => (codeFilter === null || item.code === codeFilter) && matchesQuery(item, query)),
    [items, codeFilter, query]
  );

  /** 右栏三组：表格里被筛掉的、以及当前用户看不见的已关联产品也要算进来 */
  const railGroups = useMemo(() => {
    const groups: Record<"added" | "kept" | "removed", { item: TProductPickItem; state: TProductPickState }[]> = {
      added: [],
      kept: [],
      removed: [],
    };
    for (const item of [...items, ...linkOnlyItems]) {
      const state = getProductPickState(item, selectedSet.has(item.id));
      if (state === "new") groups.added.push({ item, state });
      else if (state === "linked" || state === "locked") groups.kept.push({ item, state });
      else if (state === "remove") groups.removed.push({ item, state });
    }
    return groups;
  }, [items, linkOnlyItems, selectedSet]);

  const addedCount = railGroups.added.length;
  const removedCount = railGroups.removed.length;
  const hasChanges = addedCount > 0 || removedCount > 0;

  const toggle = (productId: string) =>
    setSelectedIds((current) =>
      current.includes(productId) ? current.filter((item) => item !== productId) : [...current, productId]
    );

  /** 拆成增删两份提交，与工作项挂模块的接口同形 */
  const handleSubmit = async () => {
    if (!hasChanges) return;
    try {
      await onSubmit({
        products: railGroups.added.map(({ item }) => item.id),
        removed_products: railGroups.removed.map(({ item }) => item.id),
      });
      handleClose();
    } catch (error) {
      const payload = error as { error?: string; code?: string } | null;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message:
          payload?.code === "PRODUCT_HAS_LINKED_REQUIREMENTS"
            ? t("project_products.has_linked_requirements")
            : (payload?.error ?? t("project_requirements.toast.failed")),
      });
    }
  };

  const renderBody = () => {
    if (isProductsLoading) {
      return (
        <Loader className="space-y-2 px-3.5 pt-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Loader.Item key={index} height="48px" />
          ))}
        </Loader>
      );
    }
    if (items.length === 0) return <EmptyBlock title={t("project_products.no_visible_products")} />;
    if (filteredItems.length > 0) {
      return <ProjectProductsTable items={filteredItems} selectedIds={selectedSet} onToggle={toggle} />;
    }
    // 代号下一个产品都没有：告诉用户别的代号下还有多少，并给一键看全部
    if (codeFilter !== null && !query) {
      const othersCount = items.length - (codeCounts.get(codeFilter) ?? 0);
      return (
        <EmptyBlock
          title={
            codeFilter === projectCode
              ? t("project_products.empty_code.current_title")
              : t("project_products.empty_code.title")
          }
          description={othersCount > 0 ? t("project_products.empty_code.others", { count: othersCount }) : undefined}
          action={
            <Button variant="secondary" size="lg" onClick={() => setCodeFilter(null)}>
              {t("project_products.empty_code.show_all")}
            </Button>
          }
        />
      );
    }
    return (
      <EmptyBlock
        title={t("project_products.no_match")}
        action={
          codeFilter !== null ? (
            <Button variant="secondary" size="lg" onClick={() => setCodeFilter(null)}>
              {t("project_products.empty_code.search_all")}
            </Button>
          ) : undefined
        }
      />
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
      <div className="flex h-[min(90vh,47.5rem)] min-h-0 flex-col">
        {/* 宽屏左右两栏；窄屏已选栏落到表格下方 */}
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_14rem] lg:grid-cols-[minmax(0,1fr)_19rem] lg:grid-rows-[minmax(0,1fr)]">
          <section className="flex min-h-0 min-w-0 flex-col px-5 pt-6.5 sm:px-7">
            <h2 className="text-20 font-semibold text-primary">{t("project_products.link")}</h2>
            <div className="mt-4.5 mb-3.5 flex flex-wrap items-center gap-2.5">
              <label className="flex h-10 w-full items-center gap-2 rounded-[10px] border border-subtle-1 bg-surface-1 px-3.5 focus-within:border-accent-strong sm:w-65">
                <SearchIcon className="size-4 shrink-0 text-placeholder" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("project_products.search_placeholder")}
                  className="min-w-0 flex-1 bg-transparent text-14 text-primary outline-none placeholder:text-placeholder"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label={t("project_products.search_clear")}
                    onClick={() => setSearchQuery("")}
                    className="grid size-5 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
                  >
                    <CloseIcon className="size-3.5" />
                  </button>
                )}
              </label>
              <ProjectProductsCodeFilter
                value={codeFilter}
                projectCode={projectCode}
                codeCounts={codeCounts}
                totalCount={items.length}
                onChange={setCodeFilter}
              />
              {!isProductsLoading && (
                <span className="ml-auto text-13 whitespace-nowrap text-tertiary">
                  {t("project_products.result_count", { count: filteredItems.length })}
                </span>
              )}
            </div>
            <div
              data-modal-wheel-scroll
              className="vertical-scrollbar scrollbar-sm -mx-3.5 min-h-0 flex-1 overflow-auto"
            >
              {renderBody()}
            </div>
          </section>

          <ProjectProductsSelectedRail
            added={railGroups.added}
            kept={railGroups.kept}
            removed={railGroups.removed}
            onToggle={toggle}
            onClose={handleClose}
          />
        </div>

        <div className="flex shrink-0 items-center gap-4 border-t border-subtle px-5 py-3.5 sm:px-7">
          <div className="flex min-w-0 items-center gap-3.5 text-14 text-secondary">
            {hasChanges ? (
              <>
                <span className="text-tertiary">{t("project_products.footer.changes")}</span>
                {addedCount > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex h-6 items-center rounded-md bg-accent-subtle px-2 text-13 font-semibold text-accent-primary tabular-nums">
                      +{addedCount}
                    </span>
                    {t("project_products.footer.added")}
                  </span>
                )}
                {removedCount > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex h-6 items-center rounded-md bg-danger-subtle px-2 text-13 font-semibold text-danger-primary tabular-nums">
                      −{removedCount}
                    </span>
                    {t("project_products.footer.removed")}
                  </span>
                )}
              </>
            ) : (
              <span className="text-placeholder">{t("project_products.footer_no_change")}</span>
            )}
          </div>
          <div className="ml-auto flex shrink-0 gap-2.5">
            <Button variant="secondary" size="lg" onClick={handleClose}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={isSubmitting}
              disabled={!hasChanges || isSubmitting}
              onClick={() => void handleSubmit()}
            >
              {t("save")}
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
};
