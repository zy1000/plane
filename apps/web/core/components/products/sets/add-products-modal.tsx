import { useEffect, useMemo, useState } from "react";
import { Pagination } from "antd";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import type { TProduct } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { ProductKindIcon } from "./product-set-tree";

const I18N = "workspace_product_sets.members";
const ROW_GRID = "grid grid-cols-[20px_minmax(0,1fr)_140px] items-center gap-3 px-6";
/** 工作区的产品可能有几千个，候选分页列出，靠搜索缩小范围 */
const PAGE_SIZE = 20;

type TProps = {
  isOpen: boolean;
  productSetId: string;
  /** 工作区里当前用户可见的全部产品（不含产品集） */
  products: TProduct[];
  isSubmitting: boolean;
  handleClose: () => void;
  onSubmit: (productIds: string[]) => void;
};

/**
 * 产品集「添加产品」：上段是没加入任何产品集的产品（可勾、分页）；下段「已属于其他产品集」
 * 按产品集分组挂着（一个产品只能属于一个产品集，不能勾），组默认收起。
 */
const SectionLabel = ({ label, count }: { label: string; count: number }) => (
  <div className="flex h-8 items-center gap-1.5 px-6 pt-2 text-12 font-medium text-tertiary">
    {label}
    <span className="font-normal text-placeholder tabular-nums">· {count}</span>
  </div>
);

export function AddProductsModal({ isOpen, productSetId, products, isSubmitting, handleClose, onSubmit }: TProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery("");
    setSelectedIds([]);
  }, [isOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [isOpen, searchQuery]);

  const query = searchQuery.trim().toLocaleLowerCase();
  const matched = useMemo(
    () =>
      products
        .filter((product) => product.product_set !== productSetId)
        .filter(
          (product) =>
            !query || [product.name, product.identifier].some((text) => text.toLocaleLowerCase().includes(query))
        ),
    [products, productSetId, query]
  );
  const candidates = useMemo(() => matched.filter((product) => !product.product_set), [matched]);
  /** 已属于其他产品集的，按产品集分组（组名取产品上带的 product_set_detail） */
  const takenGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; identifier: string; products: TProduct[] }>();
    for (const product of matched) {
      if (!product.product_set) continue;
      const group = groups.get(product.product_set) ?? {
        id: product.product_set,
        name: product.product_set_detail?.name ?? "",
        identifier: product.product_set_detail?.identifier ?? "",
        products: [],
      };
      group.products.push(product);
      groups.set(product.product_set, group);
    }
    return [...groups.values()];
  }, [matched]);
  const takenCount = takenGroups.reduce((sum, group) => sum + group.products.length, 0);
  const [expandedSetIds, setExpandedSetIds] = useState<Set<string>>(() => new Set());
  const toggleSet = (id: string) =>
    setExpandedSetIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pageRows = candidates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggle = (productId: string) =>
    setSelectedIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]
    );

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={() => !isSubmitting && handleClose()}
      position={EModalPosition.TOP}
      width={EModalWidth.XXL}
    >
      <div className="flex max-h-[min(80vh,40rem)] min-h-0 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between px-6">
          <h2 className="text-16 font-semibold text-primary">{t(`${I18N}.add_title`)}</h2>
          <button
            type="button"
            onClick={handleClose}
            className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label={t("close")}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="shrink-0 px-6 pb-3">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-subtle-1 bg-surface-1 px-3 focus-within:border-accent-strong">
            <Search className="size-4 shrink-0 text-placeholder" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t(`${I18N}.search_placeholder`)}
              className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
            />
          </label>
        </div>
        <div className={cn(ROW_GRID, "h-9 shrink-0 border-y border-subtle bg-layer-1 text-12 font-medium text-secondary")}>
          <span />
          <span>{t(`${I18N}.product`)}</span>
          <span>{t(`${I18N}.identifier`)}</span>
        </div>
        <div className="vertical-scrollbar scrollbar-sm min-h-40 flex-1 overflow-y-auto">
          {candidates.length === 0 && takenCount === 0 ? (
            <p className="py-12 text-center text-13 text-tertiary">{t(`${I18N}.no_candidates`)}</p>
          ) : (
            <>
              {candidates.length > 0 && (
                <>
                  <SectionLabel label={t(`${I18N}.group_available`)} count={candidates.length} />
                  {pageRows.map((product) => (
                    <label
                      key={product.id}
                      className={cn(ROW_GRID, "h-11 cursor-pointer text-13 text-primary hover:bg-layer-1-hover")}
                    >
                      <Checkbox checked={selectedIds.includes(product.id)} onChange={() => toggle(product.id)} />
                      <span className="flex min-w-0 items-center gap-2.5">
                        <ProductKindIcon isSet={false} />
                        <span className="truncate font-medium">{product.name}</span>
                      </span>
                      <span className="truncate font-mono text-12 text-secondary">{product.identifier}</span>
                    </label>
                  ))}
                </>
              )}
              {takenGroups.length > 0 && (
                <>
                  <SectionLabel label={t(`${I18N}.group_taken`)} count={takenCount} />
                  {takenGroups.map((group) => {
                    const isExpanded = Boolean(query) || expandedSetIds.has(group.id);
                    return (
                      <div key={group.id}>
                        <button
                          type="button"
                          onClick={() => toggleSet(group.id)}
                          aria-expanded={isExpanded}
                          className="flex h-11 w-full items-center gap-2 px-6 text-left text-13 hover:bg-layer-1-hover"
                        >
                          <span className="grid size-5 shrink-0 place-items-center text-tertiary">
                            {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                          </span>
                          <ProductKindIcon isSet />
                          <span className="truncate font-medium text-primary">{group.name}</span>
                          <span className="shrink-0 text-12 text-tertiary">
                            {group.identifier} · {group.products.length}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="mb-1 ml-[33px] border-l border-subtle-1">
                            {group.products.map((product) => (
                              <div
                                key={product.id}
                                className="grid h-9 grid-cols-[minmax(0,1fr)_140px] items-center gap-3 pr-6 pl-3 text-13 text-tertiary"
                              >
                                <span className="flex min-w-0 items-center gap-2.5">
                                  <ProductKindIcon isSet={false} muted />
                                  <span className="truncate">{product.name}</span>
                                </span>
                                <span className="truncate font-mono text-12">{product.identifier}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-subtle px-6 py-4">
          <span className="text-13 text-secondary">{t(`${I18N}.selected`, { count: selectedIds.length })}</span>
          <Pagination
            simple
            current={currentPage}
            pageSize={PAGE_SIZE}
            total={candidates.length}
            showSizeChanger={false}
            onChange={setCurrentPage}
            size="small"
          />
          <span className="flex-1" />
          <Button variant="secondary" size="lg" type="button" onClick={handleClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="lg"
            type="button"
            loading={isSubmitting}
            disabled={selectedIds.length === 0}
            onClick={() => onSubmit(selectedIds)}
          >
            {t(`${I18N}.add`)}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
