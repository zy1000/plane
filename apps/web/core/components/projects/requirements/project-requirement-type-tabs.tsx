import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover } from "@plane/propel/popover";
import type { TRequirementTypeSchema } from "@plane/types";
import { cn } from "@plane/utils";

/** 平铺几个类型；再多的收进「更多」，避免中文长类型名把页签栏挤爆 */
const MAX_INLINE_TYPES = 4;

type TProps = {
  /** 本项目里有需求的类型（项目 configuration 只返回被引用的类型） */
  requirementTypes: TRequirementTypeSchema[];
  /** null = 「全部」 */
  activeTypeId: string | null;
  onChange: (requirementTypeId: string | null) => void;
};

const segmentClassName = (isActive: boolean) =>
  cn(
    "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-3 text-13 font-medium whitespace-nowrap transition-colors",
    isActive ? "bg-surface-1 text-primary shadow-raised-200" : "text-secondary hover:text-primary"
  );

/**
 * 项目需求页的类型切换：「全部」只显示公共列；选中某个类型，表格换成该类型的字段列并可直接改。
 * 与产品需求页的 RequirementDataViewSwitcher 同一套分段样式。
 */
export const ProjectRequirementTypeTabs = ({ requirementTypes, activeTypeId, onChange }: TProps) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const inlineTypes = requirementTypes.slice(0, MAX_INLINE_TYPES);
  const overflowTypes = requirementTypes.slice(MAX_INLINE_TYPES);
  // 从「更多」里选中的类型：按钮换成它的名字并高亮
  const activeOverflowType = overflowTypes.find((type) => type.id === activeTypeId) ?? null;

  const matchedOverflowTypes = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? overflowTypes.filter((type) => type.name.toLowerCase().includes(keyword)) : overflowTypes;
  }, [overflowTypes, query]);

  useEffect(() => {
    if (!isMoreOpen) return;
    setQuery("");
    // 浮层挂上后再聚焦，base-ui 打开时会先把焦点给面板
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [isMoreOpen]);

  if (!requirementTypes.length) return null;

  const select = (requirementTypeId: string | null) => {
    setIsMoreOpen(false);
    onChange(requirementTypeId);
  };

  return (
    <div
      role="tablist"
      aria-label="需求类型"
      className="inline-flex min-w-0 items-center gap-0.5 rounded-lg bg-layer-1 p-[3px]"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTypeId === null}
        onClick={() => select(null)}
        className={segmentClassName(activeTypeId === null)}
      >
        全部
      </button>
      {inlineTypes.map((type) => (
        <button
          key={type.id}
          type="button"
          role="tab"
          aria-selected={type.id === activeTypeId}
          onClick={() => select(type.id)}
          className={segmentClassName(type.id === activeTypeId)}
        >
          <span className="max-w-[180px] truncate">{type.name}</span>
        </button>
      ))}
      {overflowTypes.length > 0 && (
        <Popover open={isMoreOpen} onOpenChange={setIsMoreOpen}>
          <Popover.Button
            className={cn(
              segmentClassName(Boolean(activeOverflowType)),
              isMoreOpen && !activeOverflowType && "bg-layer-transparent-active text-primary"
            )}
          >
            {activeOverflowType ? (
              <span className="max-w-[180px] truncate">{activeOverflowType.name}</span>
            ) : (
              <>更多 {overflowTypes.length}</>
            )}
            <ChevronDown className="size-3.5 shrink-0" />
          </Popover.Button>
          <Popover.Panel
            placement="bottom-end"
            sideOffset={6}
            positionerClassName="z-30"
            className="flex w-64 flex-col rounded-lg border border-subtle bg-surface-1 shadow-overlay-200"
          >
            <div className="px-2 pt-2 pb-1">
              <label className="flex h-8.5 items-center gap-2 rounded-md border border-subtle px-2.5 text-tertiary focus-within:border-accent-strong">
                <Search className="size-3.5 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    const first = matchedOverflowTypes[0];
                    if (first) select(first.id);
                  }}
                  placeholder="搜索类型"
                  aria-label="搜索类型"
                  className="w-full border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
                />
              </label>
            </div>
            <div className="max-h-[50vh] min-h-0 overflow-y-auto px-1.5 pb-1.5">
              {matchedOverflowTypes.length === 0 ? (
                <p className="px-2.5 py-3 text-12 text-placeholder">没有匹配的类型</p>
              ) : (
                matchedOverflowTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => select(type.id)}
                    className={cn(
                      "flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-13 text-primary hover:bg-layer-transparent-hover",
                      type.id === activeTypeId && "font-medium"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{type.name}</span>
                    {type.id === activeTypeId && <Check className="size-3.5 shrink-0 text-accent-primary" />}
                  </button>
                ))
              )}
            </div>
          </Popover.Panel>
        </Popover>
      )}
    </div>
  );
};
