import { useMemo } from "react";
import { ChevronDownIcon } from "@plane/propel/icons";
import type { TDataDictionary, TDataDictionaryItemLite } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
import { cn } from "@plane/utils";
import { DictionaryColorDot, DictionaryValueTag, resolveDictionaryItemColor } from "@/components/data-dictionaries";

type Props = {
  dictionary?: TDataDictionary;
  value: string | null;
  onChange: (itemId: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  hasError?: boolean;
  /** 字典列表还没回来时用调用方自带的 *_detail 兜住当前值（含颜色与所属字典的彩色开关） */
  fallbackItem?: TDataDictionaryItemLite | null;
  isLoading?: boolean;
  className?: string;
  buttonClassName?: string;
  tabIndex?: number;
};

export function DictionaryItemSelect(props: Props) {
  const {
    dictionary,
    value,
    onChange,
    disabled = false,
    placeholder = "",
    hasError = false,
    fallbackItem,
    isLoading = false,
    className,
    buttonClassName,
    tabIndex,
  } = props;
  const items = dictionary?.items;

  const options = useMemo(
    () =>
      items?.map((item) => {
        const color = resolveDictionaryItemColor(item, dictionary);
        return {
          value: item.id,
          query: item.label,
          content: color ? (
            <span className="flex min-w-0 items-center gap-2">
              <DictionaryColorDot color={color} size="sm" />
              <span className="truncate">{item.label}</span>
            </span>
          ) : (
            <span className="truncate">{item.label}</span>
          ),
        };
      }),
    [items, dictionary]
  );

  const selectedItem = value ? (items?.find((item) => item.id === value) ?? fallbackItem ?? null) : null;

  return (
    <CustomSearchSelect
      value={value}
      onChange={(itemId: string | null) => onChange(itemId ?? null)}
      // options 为 undefined 时下拉内显示 Loading
      options={isLoading ? undefined : (options ?? [])}
      disabled={disabled}
      className={cn("h-full w-full", className)}
      customButtonClassName="h-full rounded-md"
      tabIndex={tabIndex}
      optionsClassName="w-[min(20rem,calc(100vw-2rem))]"
      customButton={
        <div
          className={cn(
            "flex h-full w-full items-center justify-between gap-1.5 rounded-md border-[0.5px] border-strong px-2 text-left",
            disabled && "cursor-not-allowed text-secondary",
            hasError && "border-danger-strong",
            buttonClassName
          )}
        >
          <span className={cn("flex min-w-0 flex-1 items-center", !selectedItem && "text-placeholder")}>
            {selectedItem ? (
              <DictionaryValueTag
                label={selectedItem.label}
                color={resolveDictionaryItemColor(selectedItem, dictionary)}
              />
            ) : (
              <span className="truncate">{placeholder}</span>
            )}
          </span>
          <ChevronDownIcon className="size-3 shrink-0 text-secondary" aria-hidden="true" />
        </div>
      }
    />
  );
}
