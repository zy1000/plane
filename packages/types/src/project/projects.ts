/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";
import type { TDataDictionaryItemLite } from "../data-dictionary";
import type { TUserPermissions } from "../enums";
import type { TStateGroups } from "../state";
import type { IUser, IUserLite } from "../users";
import type { IWorkspace } from "../workspace";

export enum EUserProjectRoles {
  ADMIN = 20,
  MEMBER = 15,
  GUEST = 5,
}

/** 项目等级（与后端 Project.grade 一致） */
export type TProjectGrade = "P+" | "P" | "A" | "B" | "C";
/** 项目产品类型（与后端 Project.product_type choices 一致） */
export type TProjectProductType =
  | "电表"
  | "水表"
  | "气表"
  | "P2P"
  | "PLC"
  | "DCU"
  | "CIU"
  | "工具"
  | "LoRaWAN"
  | "RF mesh"
  | "Sigfox"
  | "wM-Bus"
  | "Zigbee"
  | "BLE"
  | "Gateway"
  | "WIFI"
  | "Ethernet"
  | "Lora"
  | "Hybrid"
  | "WI-SUN"
  | "Repeater"
  | "RS485"
  | "其他";

export interface IPartialProject {
  id: string;
  name: string;
  identifier: string;
  sort_order: number | null;
  logo_props: TLogoProps;
  member_role?: TUserPermissions | EUserProjectRoles | null;
  archived_at: string | null;
  workspace: IWorkspace | string;
  cycle_view: boolean;
  issue_views_view: boolean;
  module_view: boolean;
  page_view: boolean;
  inbox_view: boolean;
  guest_view_all_features?: boolean;
  project_lead?: IUserLite | string | null;
  network?: number;
  bug_count?: number;
  cycle_count?: number;
  total_work_items?: number;
  started_work_items?: number;
  backlog_work_items?: number;
  un_started_work_items?: number;
  completed_work_items?: number;
  cancelled_work_items?: number;
  /** 当前用户在该项目下的细粒度权限键，与 project-members/me 及列表接口一致 */
  permission_keys?: string[];
  // Timestamps
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  // actor
  created_by?: string;
  updated_by?: string;
  intake_count?: number;
  description_html?: string | null;
  /** 项目等级（列表/详情接口可能返回） */
  grade?: TProjectGrade | null;
  /** 项目产品类型（列表/详情接口可能返回） */
  product_type?: TProjectProductType | null;
  // ---- 0348 扩展字段：API 创建时必填（business_unit 除外），但 DB 可空（迁移前的存量项目为 null，编辑时必须补齐）----
  /** 项目代号，工作区内唯一 */
  code?: string | null;
  /** 所属BU（数据字典值 id，选填） */
  business_unit?: string | null;
  business_unit_detail?: TDataDictionaryItemLite | null;
  /** 研发产品经理（user id；只要求工作区成员，不进项目成员） */
  product_manager?: string | null;
  product_manager_detail?: IUserLite | null;
  /** 项目状态（数据字典值 id） */
  status?: string | null;
  status_detail?: TDataDictionaryItemLite | null;
  /** 项目类型（数据字典值 id；与 product_type 产品类型是两个概念） */
  project_type?: string | null;
  project_type_detail?: TDataDictionaryItemLite | null;
  /** YYYY-MM-DD */
  start_date?: string | null;
  /** YYYY-MM-DD */
  end_date?: string | null;
}

export interface IProject extends IPartialProject {
  archive_in?: number;
  close_in?: number;
  // only for uploading the cover image
  cover_image_asset?: null;
  cover_image?: string;
  // only for rendering the cover image
  readonly cover_image_url?: string;
  default_assignee?: IUser | string | null;
  default_state?: string | null;
  description?: string;
  estimate?: string | null;
  anchor?: string | null;
  is_favorite?: boolean;
  members?: string[];
  timezone?: string;
  /** PMS 系统中的项目名称（可选） */
  pms_project_name?: string | null;
  estimated_hours?: number | string | null;
  next_work_item_sequence?: number;
}

export type TProjectAnalyticsCountParams = {
  project_ids?: string;
  fields?: string;
};

export type TProjectAnalyticsCount = Pick<IProject, "id"> & {
  total_issues?: number;
  completed_issues?: number;
  total_cycles?: number;
  total_members?: number;
  total_modules?: number;
};

export interface IProjectLite {
  id: string;
  name: string;
  identifier: string;
  logo_props: TLogoProps;
}

export interface IProjectMap {
  [id: string]: IProject;
}

export interface IProjectMemberLite {
  id: string;
  member__avatar_url: string;
  member__display_name: string;
  member_id: string;
}

export type TProjectMembership = {
  member: string;
  role: TUserPermissions | EUserProjectRoles;
  custom_role_ids?: string[];
  inherited_role_ids?: string[];
  role_sources?: IProjectRoleSource[];
  permission_keys?: string[];
} & (
  | {
      id: string;
      original_role: EUserProjectRoles;
      created_at: string;
    }
  | {
      id: null;
      original_role: null;
      created_at: null;
    }
);

export interface IProjectBulkAddFormData {
  members: { role: TUserPermissions | EUserProjectRoles; member_id: string; role_ids?: string[] }[];
}

export type IProjectRoleSource = {
  type: "direct_role" | "group_role";
  role: { id: string; name: string };
  group: { id: string; name: string } | null;
};

export type IProjectMemberNavigationPreferences = {
  default_tab: string;
  hide_in_more_menu: string[];
};

export type IProjectMemberPreferencesUpdate = {
  navigation: IProjectMemberNavigationPreferences;
};

export type IProjectMemberPreferencesResponse = {
  preferences: {
    navigation: IProjectMemberNavigationPreferences;
  };
};

export type IProjectMemberPreferencesFullResponse = IProjectMemberPreferencesResponse & {
  project_id: string;
  member_id: string;
  workspace_id: string;
};

export interface IGithubRepository {
  id: string;
  full_name: string;
  html_url: string;
  url: string;
}

export interface GithubRepositoriesResponse {
  repositories: IGithubRepository[];
  total_count: number;
}

export type TProjectIssuesSearchParams = {
  search: string;
  parent?: boolean;
  issue_relation?: boolean;
  cycle?: boolean;
  release?: boolean;
  /** 排除已挂**该**需求的工作项（需求 ↔ 工作项是多对多，挂过别的需求不算） */
  exclude_requirement_id?: string;
  module?: string;
  sub_issue?: boolean;
  issue_id?: string;
  issue_type_id?: string;
  workspace_search: boolean;
  target_date?: string;
  epic?: boolean;
  limit?: number;
  offset?: number;
  my_work_items?: boolean;
  type_ids?: string;
};

export interface ISearchIssueResponse {
  id: string;
  name: string;
  project_id: string;
  project__identifier: string;
  project__name: string;
  sequence_id: number;
  start_date: string | null;
  state__color: string;
  state__group: TStateGroups;
  state__name: string;
  workspace__slug: string;
  type_id: string;
}

export type TPartialProject = IPartialProject;

export type TProject = TPartialProject & IProject;
