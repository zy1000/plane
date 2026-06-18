import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Input, type InputRef } from "antd";
import { CloseOutlined, SearchOutlined } from "@ant-design/icons";
import { useOutsideClickDetector } from "@plane/hooks";
import { cn } from "@plane/utils";

type TCasesSearchInputProps = {
  value: string;
  onSearch: (query: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export const CasesSearchInput = ({
  value,
  onSearch,
  disabled = false,
  placeholder = "搜索用例名称 / 编号",
  className,
}: TCasesSearchInputProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<InputRef>(null);

  const [isSearchOpen, setIsSearchOpen] = useState(() => value.trim().length > 0);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    if (document.activeElement !== inputRef.current?.input) {
      setInputValue(value);
    }
    if (value.trim().length > 0) {
      setIsSearchOpen(true);
    }
  }, [value]);

  useOutsideClickDetector(wrapperRef, () => {
    if (isSearchOpen && inputValue.trim() === "") {
      setIsSearchOpen(false);
    }
  });

  const openSearch = () => {
    if (disabled) return;
    setIsSearchOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const submitSearch = () => {
    const trimmedQuery = inputValue.trim();
    setInputValue(trimmedQuery);
    onSearch(trimmedQuery);
  };

  const clearSearch = () => {
    setInputValue("");
    onSearch("");
    setIsSearchOpen(false);
    inputRef.current?.blur();
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
    <div ref={wrapperRef} className={cn("flex items-center", className)}>
      {!isSearchOpen && (
        <button
          type="button"
          disabled={disabled}
          aria-label="搜索用例"
          onClick={openSearch}
          className="h-8 w-8 rounded text-secondary hover:text-primary hover:bg-layer-1 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SearchOutlined />
        </button>
      )}
      <div
        className={cn(
          "ml-auto flex w-0 items-center gap-1 overflow-hidden rounded border border-transparent bg-surface-1 opacity-0 transition-[width,padding,opacity] duration-200 ease-linear",
          {
            "w-[240px] border-subtle px-2 py-1 opacity-100": isSearchOpen,
          }
        )}
      >
        <SearchOutlined className="text-secondary" />
        <Input
          ref={inputRef}
          size="small"
          disabled={disabled}
          value={inputValue}
          placeholder={placeholder}
          onChange={(event) => setInputValue(event.target.value)}
          onPressEnter={submitSearch}
          onKeyDown={handleInputKeyDown}
          className="!border-none !bg-transparent !px-0 !shadow-none"
        />
        {isSearchOpen && (
          <button
            type="button"
            className="grid place-items-center text-secondary hover:text-primary"
            aria-label="清空搜索"
            onClick={clearSearch}
          >
            <CloseOutlined className="text-xs" />
          </button>
        )}
      </div>
    </div>
  );
};
