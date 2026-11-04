/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Types and utilities for member filtering
import type { TMemberOrderByOptions } from "@plane/constants";
import type { IUserLite, TProjectMembership } from "@plane/types";

export interface IMemberFilters {
  order_by?: TMemberOrderByOptions;
  /** 项目成员页的旧整数角色筛选（项目侧还在用） */
  roles?: string[];
  /** 工作区成员页：角色（job_role）/ 权限组 / 部门，各自任一命中即可，三者之间是「且」 */
  job_role_ids?: string[];
  permission_group_ids?: string[];
  departments?: string[];
}

// Helper function to parse order key and direction
export const parseOrderKey = (orderKey?: TMemberOrderByOptions): { field: string; direction: "asc" | "desc" } => {
  // Default to sorting by display_name in ascending order when no order key is provided
  if (!orderKey) {
    return {
      field: "display_name",
      direction: "asc",
    };
  }

  const isDescending = orderKey.startsWith("-");
  const field = isDescending ? orderKey.slice(1) : orderKey;
  return {
    field,
    direction: isDescending ? "desc" : "asc",
  };
};

// Unified function to get sort key for any member type
export const getMemberSortKey = (memberDetails: IUserLite, field: string, memberRole?: string): string | Date => {
  switch (field) {
    case "display_name":
      return memberDetails.display_name?.toLowerCase() || "";
    case "full_name": {
      const firstName = memberDetails.first_name || "";
      const lastName = memberDetails.last_name || "";
      return `${firstName} ${lastName}`.toLowerCase().trim();
    }
    case "email":
      return memberDetails.email?.toLowerCase() || "";
    case "joining_date": {
      if (!memberDetails.joining_date) {
        // Return a very old date for missing dates to sort them last
        return new Date(0);
      }
      const date = new Date(memberDetails.joining_date);
      // Return a very old date for invalid dates to sort them last
      return isNaN(date.getTime()) ? new Date(0) : date;
    }
    case "role":
      return (memberRole ?? "").toString().toLowerCase();
    default:
      return "";
  }
};

// Filter functions
export const filterProjectMembersByRole = (
  members: TProjectMembership[],
  roleFilters: string[]
): TProjectMembership[] => {
  if (roleFilters.length === 0) return members;

  return members.filter((member) => {
    const memberRole = String(member.role ?? member.original_role ?? "");
    return roleFilters.includes(memberRole);
  });
};

type TWorkspaceMemberFilterable = {
  member: string;
  is_active?: boolean;
  job_role_ids?: string[];
  custom_role_ids?: string[];
  group_role_ids?: string[];
};

/**
 * 工作区成员页的三个筛选：角色（job_role）、权限组（直绑 + 团队带来的）、部门。
 * 部门在 memberMap 上（成员接口带回来的人员扩展信息），不在 membership 里。
 */
export const filterWorkspaceMembers = <T extends TWorkspaceMemberFilterable>(
  members: T[],
  memberDetailsMap: Record<string, IUserLite>,
  filters?: IMemberFilters
): T[] => {
  const jobRoleIds = filters?.job_role_ids ?? [];
  const groupIds = filters?.permission_group_ids ?? [];
  const departments = filters?.departments ?? [];
  if (jobRoleIds.length === 0 && groupIds.length === 0 && departments.length === 0) return members;

  return members.filter((member) => {
    if (jobRoleIds.length > 0 && !(member.job_role_ids ?? []).some((id) => jobRoleIds.includes(id))) return false;
    if (groupIds.length > 0) {
      const held = new Set([...(member.custom_role_ids ?? []), ...(member.group_role_ids ?? [])]);
      if (!groupIds.some((id) => held.has(id))) return false;
    }
    if (departments.length > 0) {
      const department = (memberDetailsMap[member.member] as { department?: string | null } | undefined)?.department;
      if (!department || !departments.includes(department)) return false;
    }
    return true;
  });
};

// Unified sorting function
export const sortMembers = <T>(
  members: T[],
  memberDetailsMap: Record<string, IUserLite>,
  getMemberKey: (member: T) => string,
  getMemberRole: (member: T) => string,
  orderBy?: TMemberOrderByOptions
): T[] => {
  if (!orderBy) return members;

  const { field, direction } = parseOrderKey(orderBy);

  return [...members].sort((a, b) => {
    const aKey = getMemberKey(a);
    const bKey = getMemberKey(b);
    const aMemberDetails = memberDetailsMap[aKey];
    const bMemberDetails = memberDetailsMap[bKey];

    if (!aMemberDetails || !bMemberDetails) return 0;

    const aRole = getMemberRole(a);
    const bRole = getMemberRole(b);

    const aValue = getMemberSortKey(aMemberDetails, field, aRole);
    const bValue = getMemberSortKey(bMemberDetails, field, bRole);

    let comparison = 0;

    if (field === "joining_date") {
      // For dates, we need to handle Date objects and ensure they're valid
      const aDate = aValue instanceof Date ? aValue : new Date(aValue);
      const bDate = bValue instanceof Date ? bValue : new Date(bValue);

      // Handle invalid dates by treating them as very old dates
      const aTime = isNaN(aDate.getTime()) ? 0 : aDate.getTime();
      const bTime = isNaN(bDate.getTime()) ? 0 : bDate.getTime();

      comparison = aTime - bTime;
    } else {
      // For strings, use localeCompare for proper alphabetical sorting
      const aStr = String(aValue);
      const bStr = String(bValue);
      comparison = aStr.localeCompare(bStr);
    }

    return direction === "desc" ? -comparison : comparison;
  });
};

// Specific implementations using the unified functions
export const sortProjectMembers = (
  members: TProjectMembership[],
  memberDetailsMap: Record<string, IUserLite>,
  getMemberKey: (member: TProjectMembership) => string,
  filters?: IMemberFilters
): TProjectMembership[] => {
  // Apply role filtering first
  const filteredMembers =
    filters?.roles && filters.roles.length > 0 ? filterProjectMembersByRole(members, filters.roles) : members;

  // If no order_by filter, return filtered members
  if (!filters?.order_by) return filteredMembers;

  // Apply sorting
  return sortMembers(
    filteredMembers,
    memberDetailsMap,
    getMemberKey,
    (member) => String(member.role ?? member.original_role ?? ""),
    filters.order_by
  );
};

export const sortWorkspaceMembers = <T extends TWorkspaceMemberFilterable>(
  members: T[],
  memberDetailsMap: Record<string, IUserLite>,
  getMemberKey: (member: T) => string,
  filters?: IMemberFilters
): T[] => {
  const filteredMembers = filterWorkspaceMembers(members, memberDetailsMap, filters);

  // If no order_by filter, return filtered members
  if (!filters?.order_by) return filteredMembers;

  // Apply sorting
  return sortMembers(
    filteredMembers,
    memberDetailsMap,
    getMemberKey,
    () => "",
    filters.order_by
  );
};
