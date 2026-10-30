import { cn } from "@plane/utils";

type TOption<T extends string> = { key: T; label: string };

/** 灰底分段切换：表格 / 规划、展开层级、时间刻度共用 */
export const PlanSegmented = <T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: TOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) => (
  <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-layer-3 p-[3px]">
    {options.map((option) => {
      const active = option.key === value;
      return (
        <button
          key={option.key}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(option.key)}
          className={cn(
            "rounded-md px-3 text-13 whitespace-nowrap transition-colors",
            size === "md" ? "h-[30px]" : "h-[26px]",
            active ? "bg-surface-1 font-semibold text-primary shadow-raised-100" : "text-secondary hover:text-primary"
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
