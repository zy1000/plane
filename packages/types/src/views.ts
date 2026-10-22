/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "./common";
import type {
  IIssueDisplayFilterOptions,
  IIssueDisplayProperties,
  IIssueFilterOptions,
  TWorkItemFilterExpression,
} from "./view-props";

export enum EViewAccess {
  PRIVATE,
  PUBLIC,
}

/** 页内视图页签所属页面；公共视图（issues）即「视图」页签里的项目视图 */
export type TViewScope = "issues" | "defects" | "requirements";

/** 每人每页面的视图页签偏好，存在项目用户属性的 preferences.views[scope] */
export type TViewTabPreferences = {
  default_view_id?: string | null;
  hidden_view_ids?: string[];
  order?: string[];
};

export interface IProjectView {
  id: string;
  access: EViewAccess;
  scope?: TViewScope;
  sort_order?: number;
  created_at: Date;
  updated_at: Date;
  is_favorite: boolean;
  created_by: string;
  updated_by: string;
  name: string;
  description: string;
  rich_filters: TWorkItemFilterExpression;
  display_filters: IIssueDisplayFilterOptions;
  display_properties: IIssueDisplayProperties;
  query: IIssueFilterOptions;
  query_data: IIssueFilterOptions;
  project: string;
  workspace: string;
  logo_props: TLogoProps | undefined;
  is_locked: boolean;
  anchor?: string;
  owned_by: string;
}

export interface IPublishedProjectView extends Omit<IProjectView, "rich_filters"> {
  filters: IIssueFilterOptions;
}

export type TPublishViewSettings = {
  is_comments_enabled: boolean;
  is_reactions_enabled: boolean;
  is_votes_enabled: boolean;
};

export type TPublishViewDetails = TPublishViewSettings & {
  id: string;
  anchor: string;
};

export type TViewFiltersSortKey = "name" | "created_at" | "updated_at";

export type TViewFiltersSortBy = "asc" | "desc";

export type TViewFilterProps = {
  created_at?: string[] | null;
  owned_by?: string[] | null;
  favorites?: boolean;
  view_type?: EViewAccess[];
};

export type TViewFilters = {
  searchQuery: string;
  sortKey: TViewFiltersSortKey;
  sortBy: TViewFiltersSortBy;
  filters?: TViewFilterProps;
};
