/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useRef, useState } from "react";
import { Portal } from "@headlessui/react";
import { usePopper } from "react-popper";
import { AlertTriangle, Check, ChevronDown, Search } from "lucide-react";
// plane imports
import { useOutsideClickDetector } from "@plane/hooks";
import type { TDataDictionary } from "@plane/types";

/**
 * 选择字段引用数据字典时的三块展示：字典下拉、字典值预览、现有选项不在字典内的提示。
 * 字段库弹窗用默认尺寸，类型属性的行内表单传 dense（与该表单其余控件同一档）。数据与切换逻辑在 useFieldOptionSource。
 */

/** 字典值预览最多画这么多个标签，超出只在末尾报总数（项目代号字典有上千个值） */
const PREVIEW_LIMIT = 100;
/** 提示条里最多列出的选项数 */
const MISSING_PREVIEW_LIMIT = 10;

const TRIGGER = {
  default:
    "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-1.5 text-left text-14 text-primary outline-none hover:border-strong focus-visible:border-accent-strong disabled:cursor-not-allowed disabled:opacity-50",
  dense:
    "hover:border-accent-primary/40 flex h-9 w-full items-center justify-between gap-2 rounded-md border border-subtle bg-surface-1 px-3 text-left text-sm text-primary shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60",
};

type SelectProps = {
  dictionaries: TDataDictionary[];
  /** 当前引用的字典 id；null = 还没选 */
  value: string | null;
  /** 字典列表未加载完时触发框先显示它（编辑已引用字典的字段） */
  fallbackLabel?: string;
  isLoading?: boolean;
  disabled?: boolean;
  dense?: boolean;
  onChange: (dictionaryId: string) => void;
};

/** 数据字典下拉：带搜索，按「自定义 / 系统字典」分组，每行右侧是值的个数 */
export function FieldDictionarySelect(props: SelectProps) {
  const { dictionaries, value, fallbackLabel, isLoading = false, disabled = false, dense = false, onChange } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [reference, setReference] = useState<HTMLButtonElement | null>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const { styles, attributes } = usePopper(reference, panel, {
    placement: "bottom-start",
    strategy: "fixed",
    modifiers: [
      { name: "offset", options: { offset: [0, 4] } },
      { name: "preventOverflow", options: { padding: 12 } },
    ],
  });
  const selected = value ? dictionaries.find((dictionary) => dictionary.id === value) : undefined;
  const selectedLabel = selected?.name ?? (value ? fallbackLabel : undefined);

  const groups = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const matches = keyword
      ? dictionaries.filter((dictionary) => dictionary.name.toLowerCase().includes(keyword))
      : dictionaries;
    return [
      { key: "custom", title: "自定义", list: matches.filter((dictionary) => !dictionary.is_system) },
      { key: "system", title: "系统字典", list: matches.filter((dictionary) => dictionary.is_system) },
    ].filter((group) => group.list.length > 0);
  }, [dictionaries, query]);

  const close = () => {
    setIsOpen(false);
    setQuery("");
  };
  useOutsideClickDetector(containerRef, close, true);

  const renderEmpty = () => {
    if (isLoading && dictionaries.length === 0) return "加载中…";
    return dictionaries.length === 0 ? "暂无数据字典" : "没有匹配的数据字典";
  };

  return (
    <div ref={containerRef} className="min-w-0">
      <button
        ref={setReference}
        type="button"
        aria-label="数据字典"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        className={dense ? TRIGGER.dense : TRIGGER.default}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
      >
        <span className={`min-w-0 flex-1 truncate ${selectedLabel ? "" : "text-secondary"}`}>
          {selectedLabel ?? "请选择数据字典"}
        </span>
        <ChevronDown
          className={`shrink-0 text-tertiary transition-transform ${dense ? "size-3.5" : "size-4"} ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <Portal>
          <div
            ref={setPanel}
            style={{
              ...styles.popper,
              width: Math.max(reference?.offsetWidth ?? 0, 280),
              maxWidth: "calc(100vw - 24px)",
            }}
            {...attributes.popper}
            data-prevent-outside-click
            data-modal-wheel-scroll
            className="z-50 rounded-xl border border-subtle bg-surface-1 p-2 shadow-raised-200"
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              // 只关下拉，不让外层弹窗跟着关
              event.preventDefault();
              event.stopPropagation();
              close();
              reference?.focus();
            }}
          >
            <label className="mb-1 flex h-9 items-center gap-2 rounded-md border border-subtle px-2.5">
              <Search className="size-3.5 shrink-0 text-tertiary" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索数据字典"
                aria-label="搜索数据字典"
                className={`h-full w-full min-w-0 bg-transparent outline-none placeholder:text-tertiary ${dense ? "text-13" : "text-14"}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
              />
            </label>
            <div role="listbox" aria-label="数据字典" className="max-h-72 overflow-y-auto">
              {groups.length === 0 && <p className="px-2.5 py-3 text-13 text-secondary">{renderEmpty()}</p>}
              {groups.map((group) => (
                <div key={group.key} className="pb-1">
                  <p className="px-2.5 pt-2 pb-1 text-12 font-medium text-secondary">{group.title}</p>
                  {group.list.map((dictionary) => {
                    const isSelected = dictionary.id === value;
                    return (
                      <button
                        key={dictionary.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 text-left text-primary outline-none hover:bg-layer-1-hover focus-visible:bg-layer-1-hover ${
                          dense ? "min-h-8 py-1.5 text-13" : "min-h-9 py-2 text-14"
                        } ${isSelected ? "font-medium" : ""}`}
                        onClick={() => {
                          onChange(dictionary.id);
                          close();
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">{dictionary.name}</span>
                        <span className="shrink-0 text-13 text-tertiary tabular-nums">
                          {dictionary.items.length} 个值
                        </span>
                        {isSelected && <Check className="size-4 shrink-0 text-accent-primary" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

type ValuesProps = {
  /** 当前引用字典的值；还没选字典时传空数组并把 isEmptySelection 置 true */
  values: string[];
  isEmptySelection: boolean;
  /** 数据字典设置页地址，新标签页打开 */
  href?: string;
  dense?: boolean;
};

/** 字典值只读预览：标题行「字典值 共 N 个」+「前往数据字典」，下面是浅底标签 */
export function FieldDictionaryValues({ values, isEmptySelection, href, dense = false }: ValuesProps) {
  const shown = values.slice(0, PREVIEW_LIMIT);
  const labelClassName = dense ? "text-xs font-medium text-secondary" : "text-14 font-medium text-primary";
  const linkClassName = `rounded font-medium text-accent-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-strong ${
    dense ? "text-xs" : "text-14"
  }`;

  const renderBody = () => {
    if (isEmptySelection || values.length === 0) {
      return (
        <div
          className={`flex items-center justify-center border border-dashed border-subtle bg-layer-1 text-secondary ${
            dense ? "h-10 rounded-md text-xs" : "h-[52px] rounded-lg text-14"
          }`}
        >
          {isEmptySelection ? "选择数据字典后显示字典值" : "该数据字典尚无字典值"}
        </div>
      );
    }
    return (
      <div
        className={`flex max-h-40 flex-wrap overflow-y-auto border border-subtle bg-layer-1 ${
          dense ? "gap-1.5 rounded-md p-2.5" : "gap-2 rounded-lg p-3"
        }`}
        data-modal-wheel-scroll
      >
        {shown.map((value) => (
          <span
            key={value}
            title={value}
            className={`inline-flex max-w-full items-center rounded-md border border-subtle bg-surface-1 text-primary ${
              dense ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-13"
            }`}
          >
            <span className="truncate">{value}</span>
          </span>
        ))}
        {values.length > shown.length && (
          <span className={`inline-flex items-center text-secondary ${dense ? "h-6 text-xs" : "h-7 text-13"}`}>
            等 {values.length} 个
          </span>
        )}
      </div>
    );
  };

  return (
    <section className={dense ? "space-y-1" : "space-y-2"} aria-label="字典值">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={labelClassName}>
          字典值
          {!isEmptySelection && (
            <span className={`font-normal text-secondary ${dense ? "ml-1.5" : "ml-2"}`}>共 {values.length} 个</span>
          )}
        </h3>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
            前往数据字典
          </a>
        )}
      </div>
      {renderBody()}
    </section>
  );
}

/** 已有字段改为引用字典：字段现有的选项里有不在字典内的，保存前说明后果 */
export function FieldDictionaryMissingNotice({ options, dense = false }: { options: string[]; dense?: boolean }) {
  if (options.length === 0) return null;
  const listed = options.slice(0, MISSING_PREVIEW_LIMIT).join("、");
  return (
    <div
      role="status"
      className={`flex border border-warning-subtle bg-warning-subtle ${
        dense ? "gap-2 rounded-md px-2.5 py-2 text-xs leading-5" : "gap-2.5 rounded-lg px-3.5 py-3 text-14 leading-[22px]"
      }`}
    >
      <AlertTriangle className={`shrink-0 text-warning-primary ${dense ? "mt-0.5 size-3.5" : "mt-0.5 size-[18px]"}`} />
      <div className="min-w-0 space-y-1">
        <p className="font-medium break-words text-primary">
          现有 {options.length} 个选项不在该字典内：{listed}
          {options.length > MISSING_PREVIEW_LIMIT ? " 等" : ""}
        </p>
        <p className="text-secondary">
          保存后，已填写这些值的工作项保留原值，不可再选；默认值与联动规则中的引用同步移除。
        </p>
      </div>
    </div>
  );
}
