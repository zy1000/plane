import { useMemo } from "react";
import { ChevronDownIcon } from "@plane/propel/icons";
import type { TDataDictionary } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
import { cn } from "@plane/utils";

type Props = {
  dictionary?: TDataDictionary;
  value: string | null;
  onChange: (itemId: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  hasError?: boolean;
  /** 字典列表还没回来时用调用方自带的 *_detail.label 兜住当前值 */
  fallbackLabel?: string | null;
  isLoading?: boolean;
  className?: string;
  buttonClassName?: string;
};

export function DictionaryItemSelect(props: Props) {
  const {
    dictionary,
    value,
    onChange,
    disabled = false,
    placeholder = "",
    hasError = false,
    fallbackLabel,
    isLoading = false,
    className,
    buttonClassName,
  } = props;
  const items = dictionary?.items;

  const options = useMemo(
    () =>
      items?.map((item) => ({
        value: item.id,
        query: item.label,
        content: <span className="truncate">{item.label}</span>,
      })),
    [items]
  );

  const selectedLabel = value ? (items?.find((item) => item.id === value)?.label ?? fallbackLabel ?? null) : null;

  return (
    <CustomSearchSelect
      value={value}
      onChange={(itemId: string | null) => onChange(itemId ?? null)}
      // options 为 undefined 时下拉内显示 Loading
      options={isLoading ? undefined : (options ?? [])}
      disabled={disabled}
      className={cn("h-full w-full", className)}
      customButtonClassName="h-full rounded-md"
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
          <span className={cn("min-w-0 flex-1 truncate", !selectedLabel && "text-placeholder")}>
            {selectedLabel ?? placeholder}
          </span>
          <ChevronDownIcon className="size-3 shrink-0 text-secondary" aria-hidden="true" />
        </div>
      }
    />
  );
}
