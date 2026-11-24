import { Layers, Package } from "lucide-react";
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { TLogoProps } from "@plane/types";
import { cn } from "@plane/utils";

/**
 * 产品集父子展示的公共画法：图标块与子行连线。分组规则在 @/utils/product-set-tree，这里一并转出。
 */
export {
  buildProductSetTree,
  flattenProductSetTree,
  type TProductSetTree,
  type TProductSetTreeGroup,
  type TProductSetTreeRow,
} from "@/utils/product-set-tree";

/** 产品集 / 产品图标：不带底色，只靠图形和颜色区分（产品集靛色叠层，产品强调色盒子）；外框保留占位，行与行对齐 */
export const ProductKindIcon = ({
  isSet,
  size = "md",
  muted = false,
  className,
  iconClassName,
  logoProps,
}: {
  isSet: boolean;
  /** sm 20px（下拉选项）、md 24px（其余）。同一处的产品集、集内产品、独立产品用同一档 */
  size?: "sm" | "md";
  muted?: boolean;
  className?: string;
  /** 与别的图标块（如 ProductPickTile）并排时，把里面的图形调成和它一样大 */
  iconClassName?: string;
  /** 设置了自定义图标时画在同一个位置，大小不变 */
  logoProps?: TLogoProps | null;
}) => {
  const Icon = isSet ? Layers : Package;
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-md",
        size === "sm" ? "size-5" : "size-6",
        muted ? "text-placeholder" : isSet ? "text-label-indigo-icon" : "text-accent-primary",
        className
      )}
    >
      {logoProps?.in_use ? (
        <Logo logo={logoProps} size={size === "sm" ? 12 : 14} />
      ) : (
        <Icon className={iconClassName ?? (size === "sm" ? "size-3" : "size-3.5")} />
      )}
    </span>
  );
};

/**
 * 子行左侧的连线（竖线 + 横向短线），画在 relative 的父元素里。
 * left 是竖线的横坐标，对齐父行展开箭头的中心；最后一个子行竖线只画到一半。
 */
export const ProductSetTreeGuide = ({ left, isLast }: { left: number; isLast: boolean }) => (
  <>
    <span
      aria-hidden
      className={cn("pointer-events-none absolute top-0 border-l border-subtle-1", isLast ? "h-1/2" : "bottom-0")}
      style={{ left }}
    />
    <span aria-hidden className="pointer-events-none absolute top-1/2 w-3 border-t border-subtle-1" style={{ left }} />
  </>
);
