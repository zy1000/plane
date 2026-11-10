import { cn } from "@plane/utils";

type TProps<T extends string | number> = {
  ariaLabel: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** 撑满容器宽度，各项等宽 */
  stretch?: boolean;
};

/** 布局设计器里的分段选择：每行字段数、字段宽度 */
export function LayoutSegment<T extends string | number>({
  ariaLabel,
  value,
  options,
  onChange,
  disabled,
  stretch,
}: TProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("gap-0.5 rounded-[9px] bg-layer-1-hover p-[3px]", stretch ? "flex" : "inline-flex shrink-0")}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-7 min-w-[34px] rounded-md px-2.5 text-13 transition-colors",
            stretch && "flex-1",
            option.value === value
              ? "bg-surface-1 font-semibold text-accent-primary shadow-sm"
              : "font-medium text-secondary hover:text-primary"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
