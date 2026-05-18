import { FolderPlus, Search, X } from "lucide-react";
import { Button } from "@plane/propel/button";
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
}: TToolbarProps) => (
  <div className="flex items-center gap-2">
    <div className="group relative flex h-8 w-[260px] items-center">
      <Search className="pointer-events-none absolute left-2.5 size-3.5 text-tertiary transition-colors group-focus-within:text-primary" />
      <input
        value={keyword}
        onChange={(e) => onKeywordChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSearch();
        }}
        placeholder="Search Objects"
        className="h-8 w-full rounded-md border border-subtle bg-layer-1 pl-8 pr-7 text-[13px] text-primary placeholder:text-placeholder transition focus:border-accent-strong focus:outline-none focus:ring-2 focus:ring-accent-subtle"
      />
      {keyword && (
        <button
          type="button"
          onClick={() => {
            onKeywordChange("");
            onSearch();
          }}
          className="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded text-tertiary hover:bg-layer-2 hover:text-primary"
        >
          <X className="size-3" />
        </button>
      )}
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
