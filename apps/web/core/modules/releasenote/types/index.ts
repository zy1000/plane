export type TReleasenoteUpdateType = "added" | "fixed" | "improved";

export interface IReleasenoteItem {
  id: string;
  title: string;
  summary: string;
  description: string;
  content: string;
  version: string;
  tags: string[];
  links: string[];
  screenshots: string[];
  release_date: string | null;
  update_type: TReleasenoteUpdateType;
  is_pinned: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IReleasenoteListResponse {
  count: number;
  data: IReleasenoteItem[];
}

export interface IReleasenoteListParams {
  page?: number;
  page_size?: number;
  search?: string;
  update_type?: TReleasenoteUpdateType;
  include_inactive?: boolean;
}

export interface IReleasenoteFormPayload {
  title: string;
  summary: string;
  description: string;
  content: string;
  version: string;
  links: string[];
  screenshots: string[];
  release_date: string | null;
  update_type: TReleasenoteUpdateType;
  is_pinned: boolean;
  is_active?: boolean;
}
