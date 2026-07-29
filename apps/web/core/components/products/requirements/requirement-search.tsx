import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";

type TProductRequirementSearchProps = {
  value: string;
  onSearch: (query: string) => void;
  className?: string;
};

export function ProductRequirementSearch(props: TProductRequirementSearchProps) {
  const { value, onSearch, className } = props;
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(value.trim() !== "");

  const clearSearch = () => {
    onSearch("");
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (value.trim() !== "") clearSearch();
    else setIsSearchOpen(false);
  };

  useOutsideClickDetector(inputRef, () => {
    if (isSearchOpen && value.trim() === "") setIsSearchOpen(false);
  });

  useEffect(() => {
    if (value.trim() !== "") setIsSearchOpen(true);
  }, [value]);

  return (
    <div className={cn("flex items-center", className)}>
      {!isSearchOpen && (
        <IconButton
          variant="ghost"
          size="lg"
          className="-mr-1"
          onClick={() => {
            setIsSearchOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          icon={SearchIcon}
          aria-label={t("workspace_products.requirements.search")}
        />
      )}
      <div
        className={cn(
          "ml-auto flex w-0 items-center justify-start gap-1 overflow-hidden rounded-md border border-transparent bg-surface-1 text-placeholder opacity-0 transition-[width] ease-linear",
          {
            "w-40 border-subtle px-2.5 py-1.5 opacity-100 md:w-64": isSearchOpen,
          }
        )}
      >
        <SearchIcon className="size-3.5 shrink-0" />
        <input
          ref={inputRef}
          className="min-w-0 flex-1 border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
          aria-label={t("workspace_products.requirements.search")}
          placeholder={t("workspace_products.requirements.search")}
          value={value}
          onChange={(event) => onSearch(event.target.value)}
          onKeyDown={handleInputKeyDown}
        />
        {isSearchOpen && (
          <button
            type="button"
            className="focus-visible:outline-accent-primary grid size-5 shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-primary focus-visible:outline focus-visible:outline-2"
            onClick={() => {
              clearSearch();
              setIsSearchOpen(false);
            }}
            aria-label={t("workspace_products.requirements.actions.clear_search")}
          >
            <CloseIcon className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}
