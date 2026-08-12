import type { TLogoProps } from "./common";
import type { IUserLite } from "./users";

export type TProductNetwork = 0 | 2;

export type TProduct = {
  id: string;
  name: string;
  /** 需求编号的前缀（ECOM-1 里的 ECOM）。工作区内唯一，服务端强制大写。 */
  identifier: string;
  description_html: string | null;
  network: TProductNetwork;
  workspace: string;
  owner: string;
  reviewers: string[];
  owner_detail: IUserLite;
  reviewer_details: IUserLite[];
  logo_props: TLogoProps;
  /** 封面外链（Unsplash 等）。上传的封面存在 cover_image_asset，读取统一走 cover_image_url。 */
  cover_image: string | null;
  readonly cover_image_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TCreateProductPayload = {
  name: string;
  identifier: string;
  description_html?: string | null;
  network: TProductNetwork;
  owner: string;
  reviewers?: string[];
  logo_props?: TLogoProps;
  cover_image?: string | null;
  /** 仅创建时有效：已上传的 PRODUCT_COVER 资产 id，由后端在 create 时反向绑定 */
  cover_image_asset?: string | null;
};

export type TUpdateProductPayload = Partial<TCreateProductPayload>;

export type TProductRole = {
  id: number;
  product: string;
  name: string;
  description: string | null;
  permissions: Record<string, never>;
  created_at: string;
  updated_at: string;
};

export type TCreateProductRolePayload = {
  name: string;
  description?: string | null;
};

export type TUpdateProductRolePayload = Partial<TCreateProductRolePayload>;

export type TProductMember = {
  id: number;
  product: string;
  member: string;
  custom_role_ids: number[];
  member_detail: IUserLite;
  role_details: TProductRole[];
  created_at: string;
  updated_at: string;
};

export type TCreateProductMemberPayload = {
  member: string;
  custom_role_ids?: number[];
};

export type TUpdateProductMemberRolesPayload = {
  custom_role_ids: number[];
};
