import { useEffect, useRef, useState } from "react";
import type { Placement } from "@popperjs/core";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import { Combobox } from "@headlessui/react";
import { Boxes } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, SearchIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TFlatProductModule } from "@plane/types";
import { cn, sortBySelectedFirst } from "@plane/utils";
import { usePlatformOS } from "@/hooks/use-platform-os";

type DropdownOptions =
  | {
      value: string | null;
      query: string;
      content: React.ReactNode;
    }[]
  | undefined;

interface Props {
  getProductModuleById: (moduleId: string) => TFlatProductModule | null;
  isOpen: boolean;
  moduleIds?: string[];
  onDropdownOpen?: () => void;
  placement: Placement | undefined;
  referenceElement: HTMLButtonElement | null;
  value?: string | null;
}

export const ProductModuleOptions = observer(function ProductModuleOptions(props: Props) {
  const { getProductModuleById, isOpen, moduleIds, onDropdownOpen, placement, referenceElement, value } = props;
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

  // 搜索时按路径匹配；不搜索时保持树的顺序并按层级缩进
  const options: DropdownOptions = moduleIds?.map((moduleId) => {
    const module = getProductModuleById(moduleId);
    return {
      value: moduleId,
      query: module?.path ?? "",
      content: (
        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: query ? 0 : (module?.depth ?? 0) * 12 }}>
          <Boxes className="h-3 w-3 flex-shrink-0" />
          <Tooltip tooltipContent={module?.path} isMobile={isMobile}>
            <span className="flex-grow truncate">{query ? module?.path : module?.name}</span>
          </Tooltip>
        </div>
      ),
    };
  });

  const noModuleLabel = t("product_module_field.no_module");
  options?.unshift({
    value: null,
    query: noModuleLabel,
    content: (
      <div className="flex items-center gap-2">
        <Boxes className="h-3 w-3 flex-shrink-0" />
        <span className="flex-grow truncate">{noModuleLabel}</span>
      </div>
    ),
  });

  const filteredOptions = sortBySelectedFirst(
    query === "" ? options : options?.filter((o) => o.query.toLowerCase().includes(query.toLowerCase())),
    value
  );

  return (
    <Combobox.Options className="fixed z-10" static>
      <div
        className="my-1 w-56 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none"
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
