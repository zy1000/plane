import type { ReactNode } from "react";
import { SearchIcon } from "@plane/propel/icons";

/**
 * 模板中心各页共用的页头：一行，左边标题（可带数量），右边搜索 + 主按钮。
 * 底边线把页头和下面的「贴边窄列 + 内容」分开，页面自己不用再画分隔线。
 */
export function TemplatePageHeader({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2.5 border-b border-subtle px-7">
      <h1 className="truncate text-20 leading-7 font-semibold text-primary">{title}</h1>
      {count !== undefined && <span className="text-14 tabular-nums text-tertiary">{count}</span>}
      {children && <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

/** 页头里的搜索框 */
export function TemplatePageSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-placeholder" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-60 rounded-md border border-subtle bg-surface-1 pr-2.5 pl-8 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
      />
    </div>
  );
}
