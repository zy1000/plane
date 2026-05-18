import { Copy, Download, FolderInput, Trash2, X } from "lucide-react";

type TSelectionBarProps = {
  open: boolean;
  count: number;
  canDelete: boolean;
  onClear: () => void;
  onBatchDownload: () => void;
  onBatchCopy: () => void;
  onBatchMove: () => void;
  onBatchDelete: () => void;
};

const Pill = ({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition ${
      danger
        ? "text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
        : "text-zinc-200 hover:bg-white/[0.08] hover:text-white"
    }`}
  >
    {children}
  </button>
);

export const SelectionBar = ({
  open,
  count,
  canDelete,
  onClear,
  onBatchDownload,
  onBatchCopy,
  onBatchMove,
  onBatchDelete,
}: TSelectionBarProps) => {
  return (
    <div
      className={`pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 transition-all duration-300 ease-out ${
        open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`}
      aria-hidden={!open}
    >
      <div
        className={`flex items-center gap-1 rounded-xl bg-zinc-900/95 px-2 py-1.5 shadow-overlay-200 ring-1 ring-white/10 backdrop-blur-md dark:bg-zinc-950/95 ${
          open ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 pl-2 pr-1 text-[12px]">
          <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-accent-primary px-1.5 text-[11px] font-semibold text-on-color tabular-nums">
            {count}
          </span>
          <span className="tracking-tight text-zinc-300">项已选</span>
        </div>
        <div className="mx-1 h-5 w-px bg-white/15" />
        <Pill onClick={onBatchDownload}>
          <Download className="size-3.5" />
          下载
        </Pill>
        <Pill onClick={onBatchCopy}>
          <Copy className="size-3.5" />
          复制到
        </Pill>
        <Pill onClick={onBatchMove}>
          <FolderInput className="size-3.5" />
          移动到
        </Pill>
        {canDelete && (
          <Pill onClick={onBatchDelete} danger>
            <Trash2 className="size-3.5" />
            删除
          </Pill>
        )}
        <div className="mx-1 h-5 w-px bg-white/15" />
        <button
          type="button"
          onClick={onClear}
          title="取消选择"
          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
};
