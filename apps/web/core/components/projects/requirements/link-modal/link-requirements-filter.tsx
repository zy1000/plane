/**
 * 关联研发需求弹窗工具栏上的单选筛选（产品 / 类型）：null 表示全部。
 * 选项可以分组（产品按「已关联本项目 / 其他产品」），每项可带条数。
 * 浮层不走 portal，直接绝对定位在弹窗里，与关联产品弹窗的项目代号筛选同一套写法。
 */
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";

export type TLinkFilterOption = {
  id: string;
  label: string;
  /** 跟在名字后面的次要信息，例如产品的开发编号 */
  suffix?: string;
  leading?: ReactNode;
  count?: number;
};

export type TLinkFilterGroup = {
  key: string;
  title?: string;
  options: TLinkFilterOption[];
};

const Option = ({
  label,
  suffix,
  leading,
  count,
  isSelected,
  onClick,
}: Omit<TLinkFilterOption, "id"> & { isSelected: boolean; onClick: () => void }) => (
  <button
    type="button"
    role="option"
    aria-selected={isSelected}
    onClick={onClick}
    className={cn(
      "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-13 text-primary hover:bg-layer-transparent-hover",
      isSelected && "bg-layer-transparent-hover font-semibold"
    )}
  >
    {leading}
    <span className="min-w-0 truncate" title={label}>
      {label}
    </span>
    {suffix && (
      <span className="shrink-0 font-mono text-12 font-semibold tracking-wide text-placeholder">{suffix}</span>
    )}
    <span className="flex-1" />
    {count !== undefined && <span className="shrink-0 text-12 font-normal text-placeholder tabular-nums">{count}</span>}
    <span className="flex w-4 shrink-0 text-accent-primary">{isSelected && <Check className="size-3.75" />}</span>
  </button>
);

type TProps = {
  label: string;
  allLabel: string;
  allCount?: number;
  value: string | null;
  groups: TLinkFilterGroup[];
  searchPlaceholder: string;
  onChange: (value: string | null) => void;
};

export const LinkRequirementsFilter = (props: TProps) => {
  const { label, allLabel, allCount, value, groups, searchPlaceholder, onChange } = props;
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setIsOpen(false);
    setQuery("");
  };
  useOutsideClickDetector(containerRef, close);

  const pick = (next: string | null) => {
    onChange(next);
    close();
  };

  const selected = groups.flatMap((group) => group.options).find((option) => option.id === value) ?? null;
  const keyword = query.trim().toLowerCase();
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (option) => !keyword || `${option.label} ${option.suffix ?? ""}`.toLowerCase().includes(keyword)
      ),
    }))
    .filter((group) => group.options.length > 0);

  return (
    <div
      ref={containerRef}
      className="relative min-w-0"
      // Esc 只收起下拉，不要冒泡到 Dialog 把整个弹窗关掉
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <div
        className={cn(
          "flex h-10 max-w-[18rem] items-center overflow-hidden rounded-[10px] border bg-surface-1 transition-colors",
          isOpen ? "border-accent-strong" : "border-subtle-1"
        )}
      >
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => (isOpen ? close() : setIsOpen(true))}
          className="flex h-full min-w-0 items-center gap-2 pr-2.5 pl-3.5 text-14 text-primary"
        >
          <span className="shrink-0 text-tertiary">{label}</span>
          <span className="truncate font-medium" title={selected?.label}>
            {selected?.label ?? t("project_requirements.linkable.filter_all")}
          </span>
          <ChevronDown
            className={cn("size-3.75 shrink-0 text-placeholder transition-transform", isOpen && "rotate-180")}
          />
        </button>
        {value !== null && (
          <button
            type="button"
            aria-label={allLabel}
            onClick={() => pick(null)}
            className="grid h-full w-8.5 shrink-0 place-items-center border-l border-subtle text-placeholder hover:bg-layer-transparent-hover hover:text-primary"
          >
            <CloseIcon className="size-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 z-20 mt-1.5 w-[25rem] max-w-[calc(100vw-2rem)] rounded-[10px] border border-subtle bg-surface-1 p-1 shadow-overlay-200">
          <label className="-mx-1 -mt-1 mb-1 flex h-10 items-center gap-2 border-b border-subtle px-3">
            <SearchIcon className="size-3.75 shrink-0 text-placeholder" />
            <input
              type="text"
              value={query}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-14 text-primary outline-none placeholder:text-placeholder"
            />
          </label>
          <div role="listbox" data-modal-wheel-scroll className="vertical-scrollbar scrollbar-sm max-h-80 overflow-y-auto">
            {!keyword && <Option label={allLabel} count={allCount} isSelected={value === null} onClick={() => pick(null)} />}
            {visibleGroups.map((group, index) => (
              <div key={group.key}>
                {(index > 0 || !keyword) && <div className="mx-1.5 my-1 border-t border-subtle" />}
                {group.title && (
                  <div className="mx-2.5 mt-2 mb-1 text-11 font-semibold tracking-wide text-placeholder">
                    {group.title}
                    <span className="ml-1.5 font-medium tabular-nums">{group.options.length}</span>
                  </div>
                )}
                {group.options.map((option) => (
                  <Option
                    key={option.id}
                    {...option}
                    isSelected={value === option.id}
                    onClick={() => pick(option.id)}
                  />
                ))}
              </div>
            ))}
            {keyword && visibleGroups.length === 0 && (
              <p className="px-2.5 py-6 text-center text-13 text-tertiary">{t("project_requirements.linkable.no_match")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
