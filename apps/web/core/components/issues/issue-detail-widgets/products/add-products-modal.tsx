import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { ProductKindIcon } from "@/components/products/sets/product-set-tree";
import { useProjectProduct } from "@/hooks/store/use-project-product";

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  /** 已关联的产品：勾着、置灰、标「已关联」 */
  linkedProductIds: string[];
  onClose: () => void;
  onSubmit: (productIds: string[]) => Promise<unknown>;
};

/** 缺陷详情「关联产品」：从项目关联产品池里多选，产品集与集内产品按父子排列。 */
export const IssueAddProductsModal = observer(function IssueAddProductsModal(props: Props) {
  const { isOpen, workspaceSlug, projectId, linkedProductIds, onClose, onSubmit } = props;
  const { getProductById, getProjectProductIds, fetchProducts } = useProjectProduct();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const productIds = getProjectProductIds(projectId);
  useEffect(() => {
    if (isOpen && !productIds) void fetchProducts(workspaceSlug, projectId);
  }, [isOpen, productIds, fetchProducts, workspaceSlug, projectId]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIds([]);
    }
  }, [isOpen]);

  const linked = useMemo(() => new Set(linkedProductIds), [linkedProductIds]);
  // productIds 已由 store 按父子排好（产品集后面紧跟集内产品）
  const shownSetIds = new Set((productIds ?? []).filter((id) => getProductById(id)?.is_set));
  const keyword = query.trim().toLowerCase();
  const rows = (productIds ?? [])
    .map((id) => {
      const product = getProductById(id);
      const parentName =
        product?.product_set_id && shownSetIds.has(product.product_set_id)
          ? getProductById(product.product_set_id)?.name
          : undefined;
      return { id, product, isChild: parentName !== undefined, parentName };
    })
    .filter(({ product, parentName }) =>
      !keyword
        ? true
        : `${product?.name ?? ""} ${product?.identifier ?? ""} ${product?.code ?? ""} ${parentName ?? ""}`
            .toLowerCase()
            .includes(keyword)
    );

  const toggle = (id: string) => {
    if (linked.has(id)) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);
    try {
      await onSubmit(selectedIds);
      onClose();
    } catch {
      // 提示由调用方的 hook 给出
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={() => !isSubmitting && onClose()}
      position={EModalPosition.TOP}
      width={EModalWidth.XL}
    >
      {/* 在 peek 抽屉里打开时，弹窗渲染在抽屉外：带上这个标记，点弹窗不会被当成「点了抽屉外面」把抽屉关掉 */}
      <div data-prevent-outside-click className="flex max-h-[min(80vh,36rem)] min-h-0 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between px-6">
          <h2 className="text-16 font-semibold text-primary">关联产品</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label="关闭"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="shrink-0 px-6 pb-3">
          <label className="flex h-8 items-center gap-2 rounded-md border border-subtle px-2.5">
            <SearchIcon className="h-3.5 w-3.5 text-placeholder" />
            <input
              className="w-full bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
              placeholder="搜索产品名称或开发编号"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </label>
        </div>
        <div className="vertical-scrollbar scrollbar-sm min-h-32 flex-1 overflow-y-auto px-4 pb-2">
          {!productIds ? (
            <p className="py-12 text-center text-13 text-tertiary">加载中...</p>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-13 text-tertiary">
              {keyword ? "没有匹配的产品" : "本项目未关联产品"}
            </p>
          ) : (
            rows.map(({ id, product, isChild }) => {
              const isLinked = linked.has(id);
              const isChecked = isLinked || selectedIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  disabled={isLinked}
                  className={cn(
                    "flex h-10 w-full items-center gap-3 rounded-md px-2 text-left text-13 text-primary",
                    isLinked ? "cursor-default" : "hover:bg-layer-1-hover",
                    !isLinked && isChecked && "bg-layer-1"
                  )}
                >
                  <span className={cn("flex min-w-0 flex-1 items-center gap-3", isChild && "pl-6")}>
                    <Checkbox checked={isChecked} disabled={isLinked} readOnly tabIndex={-1} className="pointer-events-none" />
                    <ProductKindIcon isSet={!!product?.is_set} size="sm" />
                    <span className={cn("truncate", isLinked && "text-tertiary", product?.is_set && "font-medium")}>
                      {product?.name}
                    </span>
                  </span>
                  {isLinked && <span className="shrink-0 text-12 text-tertiary">已关联</span>}
                  <span className="w-24 shrink-0 truncate text-right font-mono text-12 text-tertiary">
                    {product?.identifier}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-subtle px-6 py-4">
          <span className="text-13 text-secondary">已选 {selectedIds.length} 个</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
              取消
            </Button>
            <Button
              variant="primary"
              size="lg"
              type="button"
              loading={isSubmitting}
              disabled={selectedIds.length === 0}
              onClick={handleSubmit}
            >
              关联
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
});
