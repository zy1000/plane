import { Fragment } from "react";
import { Layers, PackageOpen } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { TProduct } from "@plane/types";
import { DictionaryValueTag, resolveDictionaryItemColor } from "@/components/data-dictionaries";

type TProps = {
  product: TProduct;
  /** 传了才出「编辑产品」按钮 */
  onEdit?: () => void;
};

/** 概览页头：产品名 + 状态，下一行开发编号 / 项目代号 / 类别 */
export function ProductOverviewHeader({ product, onEdit }: TProps) {
  const { t } = useTranslation();
  const status = product.status_detail;
  const statusColor = resolveDictionaryItemColor(status);
  // 产品集没有项目代号（库里的 code 只是名称的副本），只列编号
  const facts = (
    product.is_set ? [product.identifier] : [product.identifier, product.code, product.category_detail?.label]
  ).filter(Boolean) as string[];

  return (
    <header className="flex flex-wrap items-center gap-3.5">
      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-layer-1 text-secondary">
        {product.logo_props?.in_use ? (
          <Logo logo={product.logo_props} size={22} />
        ) : product.is_set ? (
          <Layers className="size-5.5" strokeWidth={1.5} />
        ) : (
          <PackageOpen className="size-5.5" strokeWidth={1.5} />
        )}
      </span>
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h1 className="min-w-0 text-20 leading-snug font-semibold break-all text-primary">{product.name}</h1>
          {status &&
            (statusColor ? (
              <DictionaryValueTag label={status.label} color={statusColor} size="md" />
            ) : (
              <span className="inline-flex h-6 shrink-0 items-center rounded border border-subtle px-1.5 text-12 font-medium text-secondary">
                {status.label}
              </span>
            ))}
        </div>
        {facts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-13 text-tertiary">
            {facts.map((fact, index) => (
              <Fragment key={`${fact}-${index}`}>
                {index > 0 && <span aria-hidden className="size-[3px] rounded-full bg-layer-3" />}
                <span className={index === 0 ? "font-medium text-secondary" : undefined}>{fact}</span>
              </Fragment>
            ))}
          </div>
        )}
      </div>
      {onEdit && (
        <Button variant="secondary" size="xl" onClick={onEdit}>
          {t(product.is_set ? "workspace_product_sets.edit" : "workspace_products.edit_product")}
        </Button>
      )}
    </header>
  );
}
