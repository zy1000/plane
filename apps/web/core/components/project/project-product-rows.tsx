"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProjectLinkedProduct } from "@plane/types";
import { cn } from "@plane/utils";
import { ProductChip } from "@/components/products/product-chip";

/**
 * 项目列表里「项目 → 关联产品」的展开交互。
 *
 * ProductProject 只表达引用关系（见 db/models/product.py），所以这里只做导航：
 * 一行一个产品，缩进挂在项目行下方，点整行进该产品的需求页（与全仓库跳产品的
 * 惯例一致；裸 /products/{id} 会再重定向一次）。
 */

type TToggleProps = {
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
};

/** 项目名前的展开按钮：箭头 + 关联产品数。没有关联产品的行用 ProjectProductsTogglePlaceholder 占位对齐 */
export const ProjectProductsToggle = ({ count, isExpanded, onToggle }: TToggleProps) => (
  <Tooltip tooltipContent={isExpanded ? "收起关联产品" : `展开关联产品（${count}）`} position="top">
    <button
      type="button"
      aria-expanded={isExpanded}
      aria-label={isExpanded ? "收起关联产品" : "展开关联产品"}
      className="flex h-5 min-w-7 shrink-0 items-center gap-0.5 rounded px-0.5 text-secondary transition-colors hover:bg-layer-1-hover hover:text-primary"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
    >
      <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", isExpanded && "rotate-90")} />
      <span className="text-xs tabular-nums">{count}</span>
    </button>
  </Tooltip>
);

export const ProjectProductsTogglePlaceholder = () => <span aria-hidden className="w-7 shrink-0" />;

type TRowsProps = {
  workspaceSlug: string;
  products: TProjectLinkedProduct[];
  /** 与父表列数一致，子行整行占满 */
  colSpan: number;
};

export const ProjectProductRows = ({ workspaceSlug, products, colSpan }: TRowsProps) => (
  <>
    {products.map((product) => (
      <tr key={product.id} className="bg-layer-1 hover:bg-layer-1-hover">
        <td colSpan={colSpan} className="px-4 py-1.5">
          <Link
            href={`/${workspaceSlug}/products/${product.id}/requirements`}
            className="flex min-w-0 items-center gap-2.5 pl-8 text-primary"
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-sm bg-surface-1">
              <ProductChip
                identifier={product.identifier}
                name={product.name}
                logoProps={product.logo_props}
                hideIdentifier
                hideName
              />
            </span>
            {product.identifier ? (
              <span className="inline-flex h-5 shrink-0 items-center rounded-sm border border-strong bg-surface-1 px-1.5 font-mono text-11 font-semibold text-secondary">
                {product.identifier}
              </span>
            ) : null}
            <span className="min-w-0 truncate text-13 font-medium">{product.name}</span>
          </Link>
        </td>
      </tr>
    ))}
  </>
);
