import { Tag } from "lucide-react";
import { cn } from "@plane/utils";

/** 标准库所属产品分类的中性色标签：库列表卡片、库详情顶栏共用 */
export function ProductCategoryTag({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] max-w-full shrink-0 items-center gap-1 rounded-md bg-layer-1 px-2 text-12 font-medium text-secondary",
        className
      )}
    >
      <Tag className="size-3 shrink-0" strokeWidth={2} />
      <span className="truncate">{name}</span>
    </span>
  );
}
