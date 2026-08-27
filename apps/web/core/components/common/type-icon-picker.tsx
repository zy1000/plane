/**
 * 「类型」的图标选择器：一个色板 + 一个可搜索的 lucide 图标网格。
 *
 * 工作项类型与需求类型共用这一份 —— 两边都是「给一个用户自定义的类型挑个脸」，
 * 长得不一样只会让人以为它们是两种东西。存储也共用 logo_props.icon 的形状，
 * 所以任何一边的数据都能被另一边的渲染器读懂。
 */
import { useMemo, useRef, useState } from "react";
import * as LucideIcons from "lucide-react";
import { Check, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { LUCIDE_ICONS_LIST } from "@plane/propel/emoji-icon-picker";
import { cn } from "@plane/utils";

/** 直接用 lucide 自己的类型，别手写窄版 —— 少一个属性就要报一次 ts(2322) */
export type TLucideIcon = LucideIcon;

/** 存进 logo_props.icon 的形状，与工作项类型完全一致 */
export type TTypeIconProps = { name?: string; color?: string; background_color?: string };

export const TYPE_ICON_BACKGROUND = "#FFFFFF";

export const DEFAULT_TYPE_ICON_OPTION = {
  name: "Layers3",
  icon: LucideIcons.Layers3 as TLucideIcon,
  color: "#2563EB",
  background: TYPE_ICON_BACKGROUND,
};

export const TYPE_ICON_COLOR_OPTIONS = [
  "#0284C7",
  "#E11D48",
  "#EF4444",
  "#F97316",
  "#0F766E",
  "#3B82F6",
  "#4F46E5",
  "#6D28D9",
  "#6B7280",
];

/** 历史数据里存过小写名字，映射到现在的图标 */
const TYPE_ICON_ALIASES: Record<string, TLucideIcon> = {
  layers: LucideIcons.Layers3 as TLucideIcon,
  target: LucideIcons.CircleDot as TLucideIcon,
  type: LucideIcons.Type as TLucideIcon,
};

/**
 * 按名字取图标。走的是整个 lucide 命名空间而不是 LUCIDE_ICONS_LIST —— 后者只有
 * 155 个，够挑选用，但存量数据里的名字（Bug、Mountain 等）不在其中，只按它查会丢图标。
 */
export const getLucideIcon = (iconName?: string): TLucideIcon =>
  iconName
    ? (TYPE_ICON_ALIASES[iconName] ??
      (LucideIcons as unknown as Record<string, TLucideIcon | undefined>)[iconName] ??
      DEFAULT_TYPE_ICON_OPTION.icon)
    : DEFAULT_TYPE_ICON_OPTION.icon;

const isUtilityClass = (value?: string) =>
  !!value && !value.startsWith("#") && !value.startsWith("rgb") && !value.startsWith("hsl");

export const getTypeIconOption = (iconProps?: TTypeIconProps | null) => ({
  name: iconProps?.name ?? DEFAULT_TYPE_ICON_OPTION.name,
  icon: getLucideIcon(iconProps?.name),
  color: iconProps?.color ?? DEFAULT_TYPE_ICON_OPTION.color,
  background: TYPE_ICON_BACKGROUND,
});

export type TTypeIconOption = ReturnType<typeof getTypeIconOption>;

/** 新建类型时先随机给一套，比让所有新类型长得一模一样好认 */
export const getRandomTypeIconOption = (): TTypeIconOption => {
  const iconCandidate = LUCIDE_ICONS_LIST[Math.floor(Math.random() * LUCIDE_ICONS_LIST.length)];
  const color =
    TYPE_ICON_COLOR_OPTIONS[Math.floor(Math.random() * TYPE_ICON_COLOR_OPTIONS.length)] ??
    DEFAULT_TYPE_ICON_OPTION.color;
  if (!iconCandidate) return { ...DEFAULT_TYPE_ICON_OPTION, color };
  return {
    name: iconCandidate.name,
    icon: iconCandidate.element as TLucideIcon,
    color,
    background: TYPE_ICON_BACKGROUND,
  };
};

/** 选择器的选中值 -> 可直接提交的 logo_props.icon */
export const toTypeIconProps = (option: TTypeIconOption): TTypeIconProps => ({
  name: option.name,
  color: option.color,
  background_color: option.background,
});

/**
 * 只读渲染。默认 size-8 的方块底 + size-4 的图标，与工作项类型列表里的一致；
 * 列表行之外的窄位置（面包屑、tab）用 className / iconClassName 压小。
 */
export const TypeIcon = ({
  iconProps,
  className = "",
  iconClassName = "size-4",
}: {
  iconProps?: TTypeIconProps | null;
  className?: string;
  iconClassName?: string;
}) => {
  const iconOption = getTypeIconOption(iconProps);
  const Icon = iconOption.icon;
  const colorClassName = isUtilityClass(iconOption.color) ? iconOption.color : "";

  return (
    <span
      className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", colorClassName, className)}
      style={colorClassName ? undefined : { color: iconOption.color }}
    >
      <Icon className={iconClassName} />
    </span>
  );
};

/**
 * 选择器本体。受控：调用方持 value 与开合状态。
 *
 * 选颜色后不收起（多半还要接着挑图标），选图标后收起并清空搜索 —— 那一步是终点。
 */
export function TypeIconPicker({
  value,
  isOpen,
  onChange,
  onToggle,
  buttonClassName,
  ariaLabel = "选择图标",
}: {
  value: TTypeIconOption;
  isOpen: boolean;
  onChange: (value: TTypeIconOption) => void;
  onToggle: (isOpen: boolean) => void;
  buttonClassName?: string;
  ariaLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const Icon = value.icon;
  const selectedColor = value.color;
  const filteredIcons = useMemo(
    () => LUCIDE_ICONS_LIST.filter((icon) => icon.name.toLowerCase().includes(query.trim().toLowerCase())),
    [query]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  useOutsideClickDetector(containerRef, () => onToggle(false), true);

  const handleColorChange = (color: string) => onChange({ ...value, color, background: TYPE_ICON_BACKGROUND });

  const handleIconChange = (iconName: string, icon: TLucideIcon) => {
    onChange({ ...value, name: iconName, icon });
    onToggle(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md text-primary transition hover:bg-layer-1-hover",
          buttonClassName
        )}
        onClick={() => onToggle(!isOpen)}
        aria-label={ariaLabel}
      >
        <Icon className="size-5" style={{ color: selectedColor }} strokeWidth={2} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1 w-80 rounded-lg border border-subtle bg-surface-1 p-3 shadow-raised-200">
          <div className="mb-3 flex h-9 items-center gap-2 rounded-lg bg-surface-2 px-3">
            <Search className="size-4 text-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-full w-full bg-transparent text-sm text-primary outline-none placeholder:text-tertiary"
            />
          </div>
          <p className="mb-2 text-xs text-secondary">Choose icon color</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {TYPE_ICON_COLOR_OPTIONS.map((color) => {
              const isSelected = color === selectedColor;
              return (
                <button
                  key={color}
                  type="button"
                  className="flex size-5 items-center justify-center rounded-full"
                  style={{ backgroundColor: color }}
                  onClick={() => handleColorChange(color)}
                  aria-label="选择图标颜色"
                >
                  {isSelected && <Check className="size-3 text-white" />}
                </button>
              );
            })}
            <label className="relative flex size-5 cursor-pointer items-center justify-center rounded-full border border-subtle conical-gradient">
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                aria-label="自定义图标颜色"
              />
            </label>
          </div>
          <p className="mb-2 text-xs text-secondary">Pick icon</p>
          <div className="grid max-h-44 grid-cols-8 gap-1 overflow-y-auto pr-1">
            {filteredIcons.map((icon) => {
              const IconOption = icon.element as TLucideIcon;
              return (
                <button
                  key={icon.name}
                  type="button"
                  className="flex size-8 items-center justify-center rounded-md text-tertiary transition hover:bg-layer-1-hover hover:text-primary"
                  onClick={() => handleIconChange(icon.name, IconOption)}
                  title={icon.name}
                >
                  <IconOption className="size-4" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
