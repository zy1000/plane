/**
 * 关联产品弹窗的数据整理：把「可见产品」和「已关联记录」合成一份候选项，并算出每项的勾选状态。
 * 表格、已选栏、页脚都读这里的结果，避免三处各自判断「新增 / 将解除 / 锁定」。
 */
import type { TLogoProps, TProduct, TProductProject } from "@plane/types";

export type TProductPickItem = {
  id: string;
  name: string;
  /** 开发编号 */
  identifier: string;
  /** 项目代号；存量产品可能为空串 */
  code: string;
  logoProps: TLogoProps | null;
  isLinked: boolean;
  /** 本项目从该产品引了多少需求；大于 0 时后端拒绝解除，所以前端直接锁住 */
  requirementCount: number;
};

/**
 * locked：已关联且有需求引用，不能取消；linked：已关联且保持；remove：已关联但取消勾选；
 * new：本次新勾；none：未关联也未勾
 */
export type TProductPickState = "locked" | "linked" | "remove" | "new" | "none";

export const getProductPickState = (item: TProductPickItem, isSelected: boolean): TProductPickState => {
  if (item.isLinked && item.requirementCount > 0) return "locked";
  if (item.isLinked) return isSelected ? "linked" : "remove";
  return isSelected ? "new" : "none";
};

/**
 * 表格候选项 = 当前用户可见的产品，已关联的排前面；勾选不改变顺序，免得点一下行就跳走。
 * 已关联但当前用户看不见的产品（如私有产品）不进表格，只在已选栏里出现，见 buildLinkOnlyItems。
 */
export const buildProductPickItems = (products: TProduct[], links: TProductProject[]): TProductPickItem[] => {
  const linkByProductId = new Map(links.map((link) => [link.product, link]));
  const items = products.map((product) => {
    const link = linkByProductId.get(product.id);
    return {
      id: product.id,
      name: product.name,
      identifier: product.identifier,
      code: product.code ?? "",
      logoProps: product.logo_props ?? null,
      isLinked: Boolean(link),
      requirementCount: link?.requirement_count ?? 0,
    };
  });
  return [...items.filter((item) => item.isLinked), ...items.filter((item) => !item.isLinked)];
};

/** 已关联、但不在可见产品列表里的产品：用关联记录上的冗余字段补出展示信息 */
export const buildLinkOnlyItems = (products: TProduct[], links: TProductProject[]): TProductPickItem[] => {
  const visibleIds = new Set(products.map((product) => product.id));
  return links
    .filter((link) => !visibleIds.has(link.product))
    .map((link) => ({
      id: link.product,
      name: link.product_name,
      identifier: link.product_identifier,
      code: link.product_code ?? "",
      logoProps: link.product_logo_props,
      isLinked: true,
      requirementCount: link.requirement_count,
    }));
};
