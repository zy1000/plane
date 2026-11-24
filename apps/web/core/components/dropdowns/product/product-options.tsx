import { useEffect, useRef, useState } from "react";
import type { Placement } from "@popperjs/core";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import { Combobox } from "@headlessui/react";
import { Layers, Package } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, SearchIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProductOption } from "@plane/types";
import { cn } from "@plane/utils";
import { usePlatformOS } from "@/hooks/use-platform-os";

type DropdownOptions =
  | {
      value: string | null;
      query: string;
      content: React.ReactNode;
    }[]
  | undefined;

interface Props {
  getProductById: (productId: string) => TProductOption | null;
  isOpen: boolean;
  productIds?: string[];
  onDropdownOpen?: () => void;
  placement: Placement | undefined;
  referenceElement: HTMLButtonElement | null;
  value?: string | null;
}

export const ProductOptions = observer(function ProductOptions(props: Props) {
  const { getProductById, isOpen, productIds, onDropdownOpen, placement, referenceElement, value } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();

  useEffect(() => {
    if (isOpen) {
      onDropdownOpen?.();
      if (!isMobile) {
        inputRef.current && inputRef.current.focus();
      }
    }
  }, [isOpen, isMobile, onDropdownOpen]);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [{ name: "preventOverflow", options: { padding: 12 } }],
  });

  const searchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (query !== "" && e.key === "Escape") {
      e.stopPropagation();
      setQuery("");
    }
  };

  // productIds 已由 store 按父子排好（产品集后面紧跟集内产品）；这里只判断每项是父、子还是独立产品
  const shownSetIds = new Set((productIds ?? []).filter((productId) => getProductById(productId)?.is_set));
  const options: DropdownOptions = productIds?.map((productId) => {
    const product = getProductById(productId);
    const isSet = Boolean(product?.is_set);
    const isChild = Boolean(product?.product_set_id && shownSetIds.has(product.product_set_id));
    const parentName = isChild ? getProductById(product?.product_set_id ?? "")?.name : undefined;
    return {
      value: productId,
      // 搜产品集名也能找到它的集内产品
      query: `${product?.name} ${product?.identifier ?? ""} ${product?.code ?? ""} ${parentName ?? ""}`,
      content: (
        <div className={cn("flex min-w-0 items-center gap-2", isChild && "border-l border-subtle-1 pl-2.5 ml-1.5")}>
          {isSet ? (
            <Layers className="h-3 w-3 flex-shrink-0 text-label-indigo-icon" />
          ) : (
            <Package className="h-3 w-3 flex-shrink-0" />
          )}
          <Tooltip tooltipContent={product?.name} isMobile={isMobile}>
            <span className={cn("flex-grow truncate", isSet && "font-medium text-primary")}>{product?.name}</span>
          </Tooltip>
        </div>
      ),
    };
  });

  const noProductLabel = t("product_field.no_product");
  options?.unshift({
    value: null,
    query: noProductLabel,
    content: (
      <div className="flex items-center gap-2">
        <Package className="h-3 w-3 flex-shrink-0" />
        <span className="flex-grow truncate">{noProductLabel}</span>
      </div>
    ),
  });

  // 不把选中项提到最前：会把集内产品从它的产品集下面拆出来
  const filteredOptions =
    query === "" ? options : options?.filter((o) => o.query.toLowerCase().includes(query.toLowerCase()));

  return (
    <Combobox.Options className="fixed z-10" static>
      <div
        className="my-1 w-48 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none"
        ref={setPopperElement}
        style={styles.popper}
        {...attributes.popper}
      >
        <div className="flex items-center gap-1.5 rounded-sm border border-subtle bg-surface-2 px-2">
          <SearchIcon className="h-3.5 w-3.5 text-placeholder" strokeWidth={1.5} />
          <Combobox.Input
            as="input"
            ref={inputRef}
            className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.search.label")}
            displayValue={(assigned: any) => assigned?.name}
            onKeyDown={searchInputKeyDown}
          />
        </div>
        <div className="mt-2 max-h-48 space-y-1 overflow-y-scroll">
          {filteredOptions ? (
            filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <Combobox.Option
                  key={option.value ?? "none"}
                  value={option.value}
                  className={({ active, selected }) =>
                    cn(
                      "flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none",
                      {
                        "bg-layer-transparent-hover": active,
                        "text-primary": selected,
                        "text-secondary": !selected,
                      }
                    )
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className="flex-grow truncate">{option.content}</span>
                      {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                    </>
                  )}
                </Combobox.Option>
              ))
            ) : (
              <p className="px-1.5 py-1 text-placeholder italic">{t("common.search.no_matching_results")}</p>
            )
          ) : (
            <p className="px-1.5 py-1 text-placeholder italic">{t("common.loading")}</p>
          )}
        </div>
      </div>
    </Combobox.Options>
  );
});
