import { cn } from "@plane/utils";
import { getDictionaryColorProps } from "./dictionary-color";

type Props = {
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASS: Record<NonNullable<Props["size"]>, string> = {
  sm: "size-2.5",
  md: "size-3.5",
  lg: "size-6",
};

/** 实心色点：下拉选项前缀、管理页色点入口、色板 */
export function DictionaryColorDot(props: Props) {
  const { color, size = "md", className } = props;
  const { className: colorClassName, style } = getDictionaryColorProps(color);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "dict-dot inline-block shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]",
        SIZE_CLASS[size],
        colorClassName,
        className
      )}
      style={style}
    />
  );
}
