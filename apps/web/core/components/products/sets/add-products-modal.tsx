import { useEffect, useMemo, useState } from "react";
import { Pagination } from "antd";
import { Search } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import type { TProduct } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";

const I18N = "workspace_product_sets.members";
const ROW_GRID = "grid grid-cols-[20px_minmax(0,1fr)_128px_168px] items-center gap-3 px-6";
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
 * 产品集「添加产品」：列出还不在本集里的产品。已属于其他产品集的照常列出但不能勾，
 * 「所属产品集」列说明原因（一个产品只能属于一个产品集，要先在那边移出）。
 */
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
  const candidates = useMemo(
    () =>
      products
        .filter((product) => product.product_set !== productSetId)
        .filter(
          (product) =>
            !query || [product.name, product.identifier].some((text) => text.toLocaleLowerCase().includes(query))
        )
        // 能加的排前面，已属于其他集的沉底
        .sort((a, b) => Number(Boolean(a.product_set)) - Number(Boolean(b.product_set))),
    [products, productSetId, query]
  );
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
          <span>{t("workspace_product_sets.fields.product_set")}</span>
        </div>
        <div className="vertical-scrollbar scrollbar-sm min-h-40 flex-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="py-12 text-center text-13 text-tertiary">{t(`${I18N}.no_candidates`)}</p>
          ) : (
            pageRows.map((product) => {
              const takenBy = product.product_set_detail?.name ?? null;
              const isTaken = Boolean(product.product_set);
              return (
                <label
                  key={product.id}
                  className={cn(
                    ROW_GRID,
                    "h-11 border-b border-subtle text-13 last:border-b-0",
                    isTaken ? "cursor-not-allowed text-tertiary" : "cursor-pointer text-primary hover:bg-layer-1-hover"
                  )}
                >
                  <Checkbox
                    checked={selectedIds.includes(product.id)}
                    disabled={isTaken}
                    onChange={() => toggle(product.id)}
                  />
                  <span className="truncate font-medium">{product.name}</span>
                  <span className="truncate tabular-nums">{product.identifier}</span>
                  <span className="truncate">{takenBy ?? (isTaken ? "" : "-")}</span>
                </label>
              );
            })
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
