import { FolderOpen, FolderPlus, Search, UploadCloud } from "lucide-react";

type TEmptyStateProps = {
  variant: "empty" | "no-results";
  keyword?: string;
  canUpload?: boolean;
  canCreateFolder?: boolean;
  onUpload?: () => void;
  onCreateFolder?: () => void;
  onClearSearch?: () => void;
};

export const EmptyState = ({
  variant,
  keyword,
  canUpload,
  canCreateFolder,
  onUpload,
  onCreateFolder,
  onClearSearch,
}: TEmptyStateProps) => {
  if (variant === "no-results") {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-layer-2 text-tertiary">
          <Search className="size-6" />
        </div>
        <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-primary">未找到匹配项</h3>
        <p className="mt-1 max-w-sm text-[13px] text-secondary">
          没有在当前目录中找到包含「<span className="font-mono text-primary">{keyword}</span>」的文件或文件夹。
        </p>
        <button
          type="button"
          onClick={onClearSearch}
          className="mt-4 h-8 rounded-md border border-subtle bg-layer-1 px-3 text-[13px] font-medium text-secondary transition hover:border-strong hover:text-primary"
        >
          清除筛选
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 rounded-3xl bg-accent-primary/[0.06]" />
        <div className="absolute inset-2 rounded-2xl bg-accent-primary/[0.08]" />
        <FolderOpen className="relative size-8 text-accent-primary" strokeWidth={1.5} />
      </div>
      <h3 className="mt-5 text-[15px] font-semibold tracking-tight text-primary">这个目录是空的</h3>
      <p className="mt-1 max-w-sm text-[13px] text-secondary">
        把文件拖进来，或者从下方按钮上传 / 新建子目录开始组织。
      </p>
      <div className="mt-5 flex items-center gap-2">
        {canUpload && (
          <button
            type="button"
            onClick={onUpload}
            className="flex h-8 items-center gap-1.5 rounded-md bg-accent-primary px-3 text-[13px] font-medium text-on-color shadow-raised-200 transition hover:bg-accent-primary-hover"
          >
            <UploadCloud className="size-3.5" />
            上传文件
          </button>
        )}
        {canCreateFolder && (
          <button
            type="button"
            onClick={onCreateFolder}
            className="flex h-8 items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-3 text-[13px] font-medium text-secondary transition hover:border-strong hover:bg-layer-1-hover hover:text-primary"
          >
            <FolderPlus className="size-3.5" />
            新建文件夹
          </button>
        )}
      </div>
    </div>
  );
};
