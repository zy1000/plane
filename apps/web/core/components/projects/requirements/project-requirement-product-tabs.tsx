/**
 * 产品页签：本项目的需求按来源产品切分。
 *
 * 这是整个页面的**最外层作用域** —— 禅道的项目需求页把产品放在左树的第一层，这里
 * 换成顶部页签（与 Plane 其余页面的筛选习惯一致），但信息层级是一样的：先选产品，
 * 再在其中按阶段/类型收窄。
 *
 * 「全部」的计数与各产品计数都来自服务端分面，恒为全集，不随任何筛选变化。
 */
import type { FC } from "react";
import { useTranslation } from "@plane/i18n";
import type { TProjectRequirementFacets } from "@plane/types";
import { FacetTabs, type TFacetTabItem } from "@/components/common/facet-tabs";
import { ProductChip } from "@/components/products/product-chip";

export const PRODUCT_PARAM = "product";

/**
 * 非法/已解除关联的产品 id 回落到「全部」，与 getStageFromParam 同一范式。
 *
 * 分面还没回来时**一律放行**：深链里的产品 id 必须先被采纳去发请求，分面本身才有
 * 内容。等分面到位后如果它确实不在列表里，再清掉。反过来（先判非法）会让所有带
 * ?product= 的链接在首帧就自己把参数抹掉。
 */
export const getProductFromParam = (
  value: string | null | undefined,
  facets: TProjectRequirementFacets | null | undefined
): string | undefined => {
  if (!value) return undefined;
  if (!facets) return value;
  return facets.by_product.some((item) => item.product_id === value) ? value : undefined;
};

const ALL_KEY = "__all__";

type TProps = {
  facets: TProjectRequirementFacets | null | undefined;
  value: string | undefined;
  onChange: (productId: string | undefined) => void;
};

export const ProjectRequirementProductTabs: FC<TProps> = ({ facets, value, onChange }) => {
  const { t } = useTranslation();
  const products = facets?.by_product ?? [];

  // 只有一个产品时页签是纯噪音：它既不能切换到别的东西，也不提供额外信息
  if (products.length < 2) return null;

  const tabs: TFacetTabItem<string>[] = [
    { key: ALL_KEY, label: t("project_requirements.all_products"), badge: facets?.total ?? 0 },
    ...products.map((product) => ({
      key: product.product_id,
      label: <ProductChip identifier={product.identifier} name={product.name} />,
      badge: product.count,
    })),
  ];

  return (
    <FacetTabs
      tabs={tabs}
      activeTab={value ?? ALL_KEY}
      onChange={(key) => onChange(key === ALL_KEY ? undefined : key)}
      ariaLabel={t("project_requirements.all_products")}
      idPrefix="project-requirement-product"
      hideZeroBadge={false}
      className="px-4"
    />
  );
};
