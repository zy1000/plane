import { cn } from "@plane/utils";
import { getDictionaryColorProps } from "./dictionary-color";

type Props = {
  label: string;
  /** null = 该字典未开彩色，按纯文本渲染；取值见 resolveDictionaryItemColor */
  color: string | null;
  size?: "sm" | "md";
  className?: string;
};

/** 字典值的统一展示：下拉触发器、产品列表、只读详情共用 */
export function DictionaryValueTag(props: Props) {
  const { label, color, size = "sm", className } = props;
  if (!color) return <span className={cn("block truncate", className)}>{label}</span>;
  const { className: colorClassName, style } = getDictionaryColorProps(color);
  return (
    <span
      className={cn(
        "dict-tag inline-flex max-w-full shrink-0 items-center overflow-hidden rounded px-1.5 font-medium",
        size === "sm" ? "h-5 text-11" : "h-6 text-12",
        colorClassName,
        className
      )}
      style={style}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
