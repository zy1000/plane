import { UploadCloud } from "lucide-react";

type TDropOverlayProps = {
  active: boolean;
};

export const DropOverlay = ({ active }: TDropOverlayProps) => (
  <div
    aria-hidden={!active}
    className={`pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-accent-strong bg-accent-primary/[0.06] backdrop-blur-[2px] transition-all duration-200 ${
      active ? "scale-100 opacity-100" : "scale-[0.985] opacity-0"
    }`}
  >
    <div className="flex flex-col items-center gap-2 text-accent-primary">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-primary/15 ring-1 ring-inset ring-accent-primary/30">
        <UploadCloud className="size-6" />
      </div>
      <p className="text-[14px] font-medium tracking-tight">松开鼠标即可上传到当前目录</p>
    </div>
  </div>
);
