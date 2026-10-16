/**
 * 工作区设置 → 部门（只读）。部门是全局两层树，由「人员信息」集成（mdm_person_info）从主数据平台同步。
 * 计数只算本工作区的活跃成员。
 */
import type { TExternalIntegrationSyncSnapshot } from "./external-integration";

export type TDepartmentNode = {
  id: string;
  name: string;
  /** 三级组织含子部门 */
  count: number;
  children: TDepartmentNode[];
};

export type TDepartmentTree = {
  tree: TDepartmentNode[];
  total: number;
  assigned: number;
  unassigned: number;
  center_count: number;
  department_count: number;
  sync: {
    integration_key: string;
    is_configured: boolean;
    last_sync: TExternalIntegrationSyncSnapshot | null;
  };
};

export type TDepartmentPerson = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string;
  employee_id: string | null;
  ad_account: string | null;
  department: { id: string; name: string; path: string } | null;
  leader: { id: string; display_name: string; avatar_url: string | null } | null;
  last_login_time: string | null;
};

export type TDepartmentLeaderOption = { id: string; display_name: string; count: number };

export type TDepartmentLoginFilter = "never" | "ever";

/** department：部门 id；"none" = 未分配部门；null = 全部人员 */
export type TDepartmentPeopleQuery = {
  department: string | null;
  include_children: boolean;
  search: string;
  leader: string | null;
  login: TDepartmentLoginFilter | null;
  page: number;
  per_page: number;
};

export type TDepartmentPeopleResponse = {
  results: TDepartmentPerson[];
  total: number;
  page: number;
  per_page: number;
  leaders: TDepartmentLeaderOption[];
};
