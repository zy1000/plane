export type TChangelogUpdateType = "added" | "fixed" | "improved";

export interface IChangelogItem {
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
  update_type: TChangelogUpdateType;
  is_pinned: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IChangelogListResponse {
  count: number;
  data: IChangelogItem[];
}

export interface IChangelogListParams {
  page?: number;
  page_size?: number;
  search?: string;
  update_type?: TChangelogUpdateType;
  include_inactive?: boolean;
}

export interface IChangelogFormPayload {
  title: string;
  summary: string;
  description: string;
  content: string;
  version: string;
  links: string[];
  screenshots: string[];
  release_date: string | null;
  update_type: TChangelogUpdateType;
  is_pinned: boolean;
  is_active?: boolean;
}
