import type { IUserLite } from "./users";

export type TProductNetwork = 0 | 2;

export type TProduct = {
  id: string;
  name: string;
  description_html: string | null;
  network: TProductNetwork;
  workspace: string;
  owner: string;
  reviewers: string[];
  owner_detail: IUserLite;
  reviewer_details: IUserLite[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TCreateProductPayload = {
  name: string;
  description_html?: string | null;
  network: TProductNetwork;
  owner: string;
  reviewers?: string[];
};

export type TUpdateProductPayload = Partial<TCreateProductPayload>;
