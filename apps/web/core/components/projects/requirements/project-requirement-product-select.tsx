/**
 * 「提研发需求」弹窗的所属产品选择器。
 *
 * 已关联本项目的产品排在前面；其他产品选中后，保存时由服务端一并关联到本项目。
 * 浮层与模块下拉同一套写法（Combobox + popper 的 fixed 定位），不会被弹窗左栏的滚动裁掉。
 */
import type { KeyboardEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { Combobox } from "@headlessui/react";
import { usePopper } from "react-popper";
import { ChevronDown, Info, Package } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, SearchIcon } from "@plane/propel/icons";
import type { TProduct } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { ProductPickTile } from "@/components/projects/products/project-products-table";

export const ProductUnlinkedBadge = () => {
  const { t } = useTranslation();
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-[5px] border border-warning-subtle bg-warning-subtle px-1.5 text-11 font-semibold text-warning-primary">
      {t("project_requirements.create_modal.unlinked_badge")}
    </span>
  );
};

const GroupLabel = ({ title, count, hint }: { title: string; count: number; hint?: string }) => (
  <div className="flex items-baseline gap-1.5 px-2.5 pt-2.5 pb-1 text-11 font-semibold tracking-wide text-tertiary">
    {title}
    <span className="font-medium text-placeholder tabular-nums">{count}</span>
    {hint && <span className="ml-auto truncate font-normal text-placeholder">{hint}</span>}
  </div>
);

type TProps = {
  /** 当前用户看得见的工作区产品 */
  products: TProduct[];
  linkedProductIds: ReadonlySet<string>;
  value: string | null;
  onChange: (productId: string) => void;
  isLoading?: boolean;
};

export const ProjectRequirementProductSelect = ({ products, linkedProductIds, value, onChange, isLoading }: TProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const { styles, attributes } = usePopper(referenceElement, popperElement, { placement: "bottom-start" });

  const close = () => {
    setIsOpen(false);
    setQuery("");
  };
  useOutsideClickDetector(containerRef, close);

  const selected = products.find((product) => product.id === value) ?? null;
  const keyword = query.trim().toLowerCase();
  const { linked, others } = useMemo(() => {
    const matches = (product: TProduct) =>
      !keyword || `${product.name} ${product.identifier}`.toLowerCase().includes(keyword);
    const visible = products.filter(matches);
    return {
      linked: visible.filter((product) => linkedProductIds.has(product.id)),
      others: visible.filter((product) => !linkedProductIds.has(product.id)),
    };
  }, [keyword, linkedProductIds, products]);

  const renderOption = (product: TProduct) => (
    <Combobox.Option
      key={product.id}
      value={product.id}
      className={({ active }) =>
        cn(
          "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-13 text-primary",
          active && "bg-layer-transparent-hover"
        )
      }
    >
      {({ selected: isSelected }) => (
        <>
          <ProductPickTile logoProps={product.logo_props ?? null} size="xs" />
          <span className={cn("min-w-0 truncate", isSelected && "font-semibold")} title={product.name}>
            {product.name || product.identifier}
          </span>
          <span className="shrink-0 font-mono text-12 font-semibold tracking-wide text-placeholder">
            {product.identifier}
          </span>
          <span className="flex-1" />
          {isSelected && <CheckIcon className="size-3.5 shrink-0 text-accent-primary" />}
        </>
      )}
    </Combobox.Option>
  );

  return (
    <Combobox
      as="div"
      ref={containerRef}
      value={value}
      onChange={(next: string | null) => {
        close();
        if (next && next !== value) onChange(next);
      }}
      className="relative w-full min-w-0"
      // Esc 只收起下拉，不要冒泡到 Dialog 把整个弹窗关掉
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === "Escape" && isOpen) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        type="button"
        ref={setReferenceElement}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        className={cn(
          "flex h-[38px] w-full items-center gap-2 rounded-md border-[0.5px] bg-layer-2 px-3 text-13 text-primary transition-colors duration-150 hover:bg-layer-1",
          isOpen ? "border-accent-strong" : "border-subtle-1"
        )}
      >
        {selected ? (
          <>
            <ProductPickTile logoProps={selected.logo_props ?? null} size="xs" />
            <span className="min-w-0 truncate font-medium" title={selected.name}>
              {selected.name || selected.identifier}
            </span>
            <span className="shrink-0 font-mono text-12 font-semibold tracking-wide text-placeholder">
              {selected.identifier}
            </span>
            <span className="flex-1" />
            {!linkedProductIds.has(selected.id) && <ProductUnlinkedBadge />}
          </>
        ) : (
          <>
            <Package className="size-3.5 shrink-0 text-placeholder" />
            <span className="flex-1 truncate text-left text-placeholder">
              {t("project_requirements.create_modal.product_placeholder")}
            </span>
          </>
        )}
        <ChevronDown className="size-3 shrink-0 text-tertiary" />
      </button>

      {isOpen && (
        <Combobox.Options className="fixed z-20" static>
          <div
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
            className="my-1 w-[28rem] max-w-[calc(100vw-2rem)] rounded-[10px] border border-subtle bg-surface-1 shadow-overlay-200 focus:outline-none"
          >
            <label className="flex h-10 items-center gap-2 border-b border-subtle px-3">
              <SearchIcon className="size-3.75 shrink-0 text-placeholder" />
              <Combobox.Input
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("project_requirements.create_modal.product_search")}
                displayValue={() => query}
              />
            </label>
            <div className="vertical-scrollbar scrollbar-sm max-h-80 overflow-y-auto px-1 pb-1">
              {isLoading ? (
                <Loader className="space-y-1 p-1.5">
                  <Loader.Item height="32px" />
                  <Loader.Item height="32px" />
                </Loader>
              ) : linked.length + others.length === 0 ? (
                <p className="px-2.5 py-6 text-center text-13 text-tertiary">
                  {products.length === 0
                    ? t("project_requirements.create_modal.no_products")
                    : t("project_requirements.create_modal.no_match")}
                </p>
              ) : (
                <>
                  {linked.length > 0 && (
                    <>
                      <GroupLabel title={t("project_requirements.create_modal.group_linked")} count={linked.length} />
                      {linked.map(renderOption)}
                    </>
                  )}
                  {others.length > 0 && (
                    <>
                      {linked.length > 0 && <div className="mx-1.5 mt-1 border-t border-subtle" />}
                      <GroupLabel
                        title={t("project_requirements.create_modal.group_others")}
                        count={others.length}
                        hint={t("project_requirements.create_modal.group_others_hint")}
                      />
                      {others.map(renderOption)}
                    </>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 rounded-b-[10px] border-t border-subtle bg-layer-1 px-3 py-2 text-12 text-tertiary">
              <Info className="size-3.5 shrink-0" />
              {t("project_requirements.create_modal.switch_hint")}
            </div>
          </div>
        </Combobox.Options>
      )}
    </Combobox>
  );
};
