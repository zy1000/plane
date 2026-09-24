import { ChevronDown, ListFilter, X } from "lucide-react";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";

/** 一个阶段选项。`hint` 是右侧那行小字（可加几条 / 几行），`dim` 表示这一段没什么可选的 */
export type TStageFilterOption = {
  id: string;
  label: string;
  hint?: string;
  dim?: boolean;
  /** 子阶段缩进一级 */
  depth?: number;
};

/**
 * 阶段筛选 chip：选中一个阶段只看这一段，选中态带 ✕ 直接清除。
 *
 * 加轴弹窗的左栏和裁剪矩阵的 Tab 条共用 —— 两处都是「平铺清单靠阶段收窄」，
 * 控件长一样，行为也该一样。
 */
export const StageFilterChip = ({
  label,
  allLabel,
  value,
  options,
  allHint,
  variant = "chip",
  onChange,
}: {
  label: string;
  /** 没选阶段时 chip 上显示的值 */
  allLabel: string;
  /** null = 全部阶段 */
  value: string | null;
  options: TStageFilterOption[];
  allHint?: string;
  /** chip = 独立的一枚筛选药丸；icon = 挤在表格列头里的漏斗按钮 */
  variant?: "chip" | "icon";
  onChange: (stageId: string | null) => void;
}) => {
  const active = options.find((option) => option.id === value);
  /** 选中态的 ✕：CustomMenu 把 customButton 整个塞进它自己的 <button> 里，
   * 不拦住冒泡的话点 ✕ 会连带把菜单打开 */
  const clearIcon = (
    <X
      className="size-3.5 shrink-0"
      role="button"
      aria-label={allLabel}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onChange(null);
      }}
    />
  );
  return (
    <CustomMenu
      customButton={
        variant === "icon" ? (
          <span
            title={label}
            className={cn(
              "flex h-6 items-center gap-1 rounded-md px-1",
              active
                ? "bg-accent-subtle text-accent-primary"
                : "text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
            )}
          >
            <ListFilter className="size-3.5 shrink-0" />
            {active && clearIcon}
          </span>
        ) : (
          <span
            className={cn(
              "flex h-7.5 items-center gap-1.5 rounded-lg border px-2.5 text-12 whitespace-nowrap",
              active
                ? "border-accent-strong bg-accent-subtle text-accent-primary"
                : "border-subtle text-secondary hover:bg-layer-transparent-hover"
            )}
          >
            <ListFilter className="size-3.5 shrink-0" />
            <span className={cn(active ? "opacity-70" : "text-tertiary")}>{label}</span>
            <span className="max-w-24 truncate font-medium">{active ? active.label : allLabel}</span>
            {active ? clearIcon : <ChevronDown className="size-3.5 shrink-0" />}
          </span>
        )
      }
      // 列头那颗贴着表格最左边，菜单往右展开；独立 chip 在工具区右侧，往左展开
      placement={variant === "icon" ? "bottom-start" : "bottom-end"}
      maxHeight="lg"
      closeOnSelect
    >
      <CustomMenu.MenuItem onClick={() => onChange(null)} className="flex items-center gap-2">
        <span className={cn("flex-1", !value && "font-medium text-accent-primary")}>{allLabel}</span>
        {allHint && <span className="text-11 text-tertiary tabular-nums">{allHint}</span>}
      </CustomMenu.MenuItem>
      {options.map((option) => (
        <CustomMenu.MenuItem key={option.id} onClick={() => onChange(option.id)} className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              option.id === value && "font-medium text-accent-primary",
              option.dim && "text-tertiary"
            )}
            style={option.depth ? { paddingLeft: option.depth * 12 } : undefined}
          >
            {option.depth ? <span className="mr-1 text-placeholder">└</span> : null}
            {option.label}
          </span>
          {option.hint && <span className="shrink-0 text-11 text-tertiary tabular-nums">{option.hint}</span>}
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
};
