import { useEffect, useRef, useState } from "react";
import { FolderPlus, Search, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import type { TAssetExplorerPermissions } from "../types";

type TToolbarProps = {
  permissions: TAssetExplorerPermissions;
  keyword: string;
  onKeywordChange: (value: string) => void;
  onSearch: () => void;
  onCreateFolder: () => void;
};

export const Toolbar = ({
  permissions,
  keyword,
  onKeywordChange,
  onSearch,
  onCreateFolder,
}: TToolbarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(() => keyword.trim().length > 0);

  useEffect(() => {
    if (keyword.trim().length > 0) setIsSearchOpen(true);
  }, [keyword]);

  return (
    <div className="flex items-center gap-2">
      {!isSearchOpen && (
        <IconButton
          type="button"
          variant="ghost"
          size="lg"
          className="-mr-1"
          icon={Search}
          onClick={() => {
            setIsSearchOpen(true);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
        />
      )}
      <div
        className={`flex items-center gap-1 overflow-hidden rounded-md border text-placeholder transition-[width,opacity,padding] ease-linear ${
          isSearchOpen
            ? "h-8 w-[260px] border-subtle bg-layer-1 px-2 py-1.5 opacity-100"
            : "h-0 w-0 border-transparent px-0 py-0 opacity-0"
        }`}
      >
        <Search className="size-3.5 shrink-0 text-tertiary" />
        <input
          ref={inputRef}
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
            if (e.key === "Escape") {
              if (keyword.trim()) {
                onKeywordChange("");
                onSearch();
              } else setIsSearchOpen(false);
            }
          }}
          onBlur={() => {
            if (!keyword.trim()) setIsSearchOpen(false);
          }}
          placeholder="Search Objects"
          className="w-full border-none bg-transparent text-[13px] text-primary placeholder:text-placeholder focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            onKeywordChange("");
            onSearch();
            setIsSearchOpen(false);
          }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-tertiary hover:bg-layer-2 hover:text-primary"
        >
          <X className="size-3" />
        </button>
      </div>

      {permissions.canCreateFolder && (
        <Button
          type="button"
          onClick={onCreateFolder}
          variant="secondary"
          size="lg"
          prependIcon={<FolderPlus className="size-3.5" />}
        >
          新建文件夹
        </Button>
      )}
    </div>
  );
};
