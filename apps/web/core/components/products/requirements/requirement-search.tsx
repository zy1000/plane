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
  const [isSearchOpen, setIsSearchOpen] = useState(() => value.trim().length > 0);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setInputValue(value);
    if (value.trim().length > 0) setIsSearchOpen(true);
  }, [value]);

  useOutsideClickDetector(inputRef, () => {
    if (isSearchOpen && inputValue.trim() === "") setIsSearchOpen(false);
  });

  const clearSearch = () => {
    setInputValue("");
    onSearch("");
    setIsSearchOpen(false);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (inputValue.trim() !== "") {
        setInputValue("");
        onSearch("");
      } else {
        setIsSearchOpen(false);
        inputRef.current?.blur();
      }
    }
  };

  return (
    <div className={cn("flex items-center", className)}>
      {!isSearchOpen && (
        <IconButton
          variant="ghost"
          size="lg"
          className="-mr-1"
          onClick={() => {
            setIsSearchOpen(true);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
          icon={SearchIcon}
          aria-label={t("workspace_products.requirements.search")}
        />
      )}
      <div
        className={cn(
          "ml-auto flex w-0 items-center justify-start gap-1 overflow-hidden rounded-md border border-transparent bg-surface-1 text-placeholder opacity-0 transition-[width] ease-linear",
          {
            "w-30 border-subtle px-2.5 py-1.5 opacity-100 md:w-64": isSearchOpen,
          }
        )}
      >
        <SearchIcon className="h-3.5 w-3.5" />
        <input
          ref={inputRef}
          className="w-full max-w-[234px] border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
          placeholder={t("workspace_products.requirements.search")}
          value={inputValue}
          onChange={(event) => {
            const nextValue = event.target.value;
            setInputValue(nextValue);
            onSearch(nextValue);
          }}
          onKeyDown={handleInputKeyDown}
        />
        {isSearchOpen && (
          <button
            type="button"
            className="grid place-items-center"
            onClick={clearSearch}
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
