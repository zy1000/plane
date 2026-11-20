import type { ReactNode } from "react";
import { SearchIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";

/**
 * 模板中心各页共用的页头：一行，左边标题（可带数量），右边搜索 + 主按钮。
 * 底边线把页头和下面的「贴边窄列 + 内容」分开，页面自己不用再画分隔线。
 * 下面紧跟筛选页签时传 `bordered={false}`，分隔线由 `TemplatePageTabs` 画在页签下。
 */
export function TemplatePageHeader({
  title,
  count,
  after,
  bordered = true,
  children,
}: {
  title: string;
  count?: number;
  /** 紧跟标题的内容（如通用字段库的「工作项 | 需求」开关） */
  after?: ReactNode;
  bordered?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className={cn("flex h-16 shrink-0 items-center gap-2.5 px-7", bordered && "border-b border-subtle")}>
      <h1 className="truncate text-20 leading-7 font-semibold text-primary">{title}</h1>
      {count !== undefined && <span className="text-14 tabular-nums text-tertiary">{count}</span>}
      {after && <div className="ml-2 flex shrink-0 items-center">{after}</div>}
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
        onKeyDown={(event) => event.key === "Escape" && onChange("")}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-60 rounded-md border border-subtle bg-surface-1 pr-2.5 pl-8 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
      />
    </div>
  );
}

export type TTemplatePageTab<K extends string> = { key: K; label: string; count?: number };

/**
 * 页头下的筛选页签（下划线样式）：标准需求库按需求类型、通用字段库按范围、产品模板按需求 / 用例清单。
 * `children` 是跟页签同一行、靠右的本页签操作（如「调整顺序」「添加模块」）。
 */
export function TemplatePageTabs<K extends string>({
  tabs,
  activeKey,
  onChange,
  ariaLabel,
  className,
  disabled = false,
  children,
}: {
  tabs: TTemplatePageTab<K>[];
  activeKey: K;
  onChange: (key: K) => void;
  ariaLabel: string;
  className?: string;
  /** 页签暂时不可切换（如正在调整顺序） */
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <nav aria-label={ariaLabel} className={cn("flex shrink-0 flex-wrap gap-x-7 border-b border-subtle px-7", className)}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => onChange(tab.key)}
            className={cn(
              "-mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-14 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-accent-strong disabled:cursor-not-allowed",
              isActive
                ? "border-accent-strong font-semibold text-primary"
                : "border-transparent text-secondary hover:text-primary"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn("text-12 tabular-nums", isActive ? "font-medium text-tertiary" : "text-placeholder")}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
      {children && <div className="ml-auto flex shrink-0 items-center gap-2 pb-2">{children}</div>}
    </nav>
  );
}
