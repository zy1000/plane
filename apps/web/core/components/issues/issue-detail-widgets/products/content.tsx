import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Link } from "react-router";
import { Link2Off } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueProductLink } from "@plane/types";
import { ProductKindIcon } from "@/components/products/sets/product-set-tree";

type Props = {
  products: TIssueProductLink[];
  disabled: boolean;
  onRemove: (productId: string) => void;
};

/** 缺陷详情「产品」区块的行：产品名（点开产品概览）+ 开发编号 + 解除关联（行样式同「用例」区块）。 */
export const IssueProductsCollapsibleContent = observer(function IssueProductsCollapsibleContent(props: Props) {
  const { products, disabled, onRemove } = props;
  const { workspaceSlug } = useParams();

  const isLast = products.length === 1;
  return (
    <div className="pb-1">
      {products.map((item) => (
        <div
          key={item.product_id}
          className="group relative flex min-h-11 w-full items-center gap-2 py-1 pr-2 transition-all hover:bg-surface-2"
          style={{ paddingLeft: 6 }}
        >
          {/* 对齐子工作项行首的展开箭头占位 */}
          <div className="flex size-5 shrink-0" aria-hidden />
          <ProductKindIcon isSet={!!item.product_is_set} size="sm" />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Link
              to={`/${workspaceSlug?.toString()}/products/${item.product_id}/overview`}
              className="truncate text-13 text-primary hover:text-accent-primary hover:underline"
            >
              {item.product_name}
            </Link>
            {item.product_identifier && (
              <span className="shrink-0 font-mono text-11 text-tertiary">{item.product_identifier}</span>
            )}
          </div>
          {!disabled && (
            <Tooltip tooltipContent={isLast ? "缺陷至少关联一个产品" : "解除关联"}>
              <button
                type="button"
                aria-label="解除关联"
                disabled={isLast}
                onClick={() => onRemove(item.product_id)}
                className="grid size-6 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Link2Off className="size-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      ))}
    </div>
  );
});
