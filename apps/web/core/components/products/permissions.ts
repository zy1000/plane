import type { TProduct } from "@plane/types";

type TProductLike = Pick<TProduct, "my_permission_keys"> | null | undefined;

/**
 * 产品内的按钮显隐统一读产品对象上的 my_permission_keys（后端按当前用户算好）。
 * 产品负责人 / 工作区管理员 / 实例管理员在后端已直通，前端不用再叠一层判断。
 */
export const hasProductPermission = (product: TProductLike, ...permissionKeys: string[]) => {
  const held = product?.my_permission_keys ?? [];
  return permissionKeys.some((key) => held.includes(key));
};
