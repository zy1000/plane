import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { message } from "antd";
import type { TAssetFolder } from "@/services/asset-explorer.service";

type TPathBarProps = {
  breadcrumbs: TAssetFolder[];
  onNavigate: (folderId: number) => void;
};

export const BreadcrumbBar = ({ breadcrumbs, onNavigate }: TPathBarProps) => {
  const [copied, setCopied] = useState(false);

  const segments = breadcrumbs.length > 0 ? breadcrumbs : [];
  const pathText = segments.length > 0 ? segments.map((s) => s.name).join("/") + "/" : "/";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pathText);
      setCopied(true);
      message.success("已复制路径");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      message.error("复制失败");
    }
  };

  return (
    <div className="group flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 font-mono text-[13px] leading-none text-secondary">
      {segments.length === 0 ? (
        <span className="text-tertiary">/</span>
      ) : (
        <ol className="flex min-w-0 flex-wrap items-center gap-y-1">
          {segments.map((item, index) => {
            const isLast = index === segments.length - 1;
            return (
              <li key={item.id} className="flex items-center">
                {isLast ? (
                  <span
                    className="rounded px-1 py-0.5 font-semibold text-primary"
                    title={item.name}
                  >
                    {item.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="cursor-pointer rounded px-1 py-0.5 text-accent-primary transition-colors hover:bg-accent-primary/10 hover:text-accent-primary"
                    onClick={() => onNavigate(item.id)}
                    title={item.name}
                  >
                    {item.name}
                  </button>
                )}
                <span className="select-none px-0.5 text-tertiary">/</span>
              </li>
            );
          })}
        </ol>
      )}
      <button
        type="button"
        onClick={handleCopy}
        title="复制路径"
        className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-tertiary opacity-0 transition hover:bg-layer-2 hover:text-primary group-hover:opacity-100"
      >
        {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
};
