/**
 * 产品筛选的 URL 参数约定。
 *
 * 页面入口已改为工具栏「管理产品」弹窗；这里只保留深链解析，避免 ?product=
 * 在名单未就绪时被首帧抹掉。
 */

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
