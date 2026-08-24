/**
 * 产品浏览范围的 URL 参数约定。
 *
 * 左侧栏独占 `?product=`，与 `?moduleId=` 同级。非法 / 已解除关联的 id
 * 回落到「全部」，避免深链首帧在名单未就绪时把自己抹掉。
 */

import type { TRequirementModule } from "@plane/types";

export const PRODUCT_PARAM = "product";

/**
 * 非法/已解除关联的产品 id 回落到「全部」，与 getStatusFromParam 同一范式。
 *
 * `allowedProductIds === null/undefined` 表示名单尚未就绪：**一律放行**，避免深链
 * 首帧把自己抹掉。名单就绪后（含空数组）再校验是否仍在已关联产品里。
 */
export const getProductFromParam = (
  value: string | null | undefined,
  allowedProductIds: string[] | null | undefined
): string | undefined => {
  if (!value) return undefined;
  if (!allowedProductIds) return value;
  return allowedProductIds.includes(value) ? value : undefined;
};

const treeContainsModule = (modules: TRequirementModule[], moduleId: string): boolean =>
  modules.some((item) => item.id === moduleId || treeContainsModule(item.children, moduleId));

/** 当前选中的模块是否属于该产品分组。分组名单未到时不要用来清 moduleId。 */
export const moduleBelongsToProduct = (
  groups: { product_id: string; modules: TRequirementModule[] }[],
  productId: string,
  moduleId: string
): boolean => {
  const group = groups.find((item) => item.product_id === productId);
  return group ? treeContainsModule(group.modules, moduleId) : false;
};
