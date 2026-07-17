/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef, useState } from "react";
import type { IWorkspaceGroup, IWorkspaceGroupMember, IWorkspaceGroupRole, IWorkspaceRole } from "@plane/types";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

type TGroupsState = {
  groups: IWorkspaceGroup[];
  isLoading: boolean;
};

type TGroupDetailState = {
  members: IWorkspaceGroupMember[];
  roles: IWorkspaceGroupRole[];
  isLoading: boolean;
  /** 是否已成功拉取过一次（含空列表） */
  loaded: boolean;
  error: string | null;
};

type TWorkspaceGroupBulkMutationResult = {
  succeededIds: string[];
  failures: {
    targetId: string;
    message: string;
  }[];
};

const emptyDetail = (): TGroupDetailState => ({
  members: [],
  roles: [],
  isLoading: false,
  loaded: false,
  error: null,
});

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return fallback;

  const errorRecord = error as Record<string, unknown>;
  const preferredValue = errorRecord.detail ?? errorRecord.error ?? errorRecord.member ?? errorRecord.role;
  if (typeof preferredValue === "string") return preferredValue;
  if (Array.isArray(preferredValue) && typeof preferredValue[0] === "string") return preferredValue[0];

  return fallback;
};

export const useWorkspaceGroups = (workspaceSlug: string | undefined) => {
  const [groupsState, setGroupsState] = useState<TGroupsState>({
    groups: [],
    isLoading: false,
  });
  const [detailByGroupId, setDetailByGroupId] = useState<Record<string, TGroupDetailState>>({});
  const [availableRoles, setAvailableRoles] = useState<IWorkspaceRole[]>([]);
  const [isAvailableRolesLoading, setIsAvailableRolesLoading] = useState(false);
  const [availableRolesError, setAvailableRolesError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const detailRef = useRef(detailByGroupId);
  detailRef.current = detailByGroupId;
  const inFlightRef = useRef<Set<string>>(new Set());

  const fetchGroups = useCallback(async () => {
    if (!workspaceSlug) return;
    setGroupsState((prev) => ({ ...prev, isLoading: true }));
    setListError(null);
    try {
      const data = await workspaceService.fetchWorkspaceGroups(workspaceSlug);
      setGroupsState({ groups: data, isLoading: false });
    } catch (error) {
      setListError(getErrorMessage(error, "获取团队列表失败"));
      setGroupsState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [workspaceSlug]);

  const loadGroupDetail = useCallback(
    async (groupId: string, force = false) => {
      if (!workspaceSlug) return;
      if (detailRef.current[groupId]?.loaded && !force) return;
      if (inFlightRef.current.has(groupId)) return;
      inFlightRef.current.add(groupId);

      setDetailByGroupId((prev) => ({
        ...prev,
        [groupId]: {
          ...(prev[groupId] ?? emptyDetail()),
          isLoading: true,
          error: null,
        },
      }));

      try {
        const [members, roles] = await Promise.all([
          workspaceService.fetchWorkspaceGroupMembers(workspaceSlug, groupId),
          workspaceService.fetchWorkspaceGroupRoles(workspaceSlug, groupId),
        ]);
        setDetailByGroupId((prev) => ({
          ...prev,
          [groupId]: { members, roles, isLoading: false, loaded: true, error: null },
        }));
        // 以详情列表为准校正角标，避免列表接口历史计数与实际成员不一致
        setGroupsState((prev) => ({
          ...prev,
          groups: prev.groups.map((group) =>
            group.id === groupId
              ? { ...group, member_count: members.length, role_count: roles.length }
              : group
          ),
        }));
      } catch (error) {
        setDetailByGroupId((prev) => ({
          ...prev,
          [groupId]: {
            ...(prev[groupId] ?? emptyDetail()),
            isLoading: false,
            loaded: false,
            error: getErrorMessage(error, "获取团队详情失败"),
          },
        }));
      } finally {
        inFlightRef.current.delete(groupId);
      }
    },
    [workspaceSlug]
  );

  const fetchAvailableRoles = useCallback(async () => {
    if (!workspaceSlug) return;
    setIsAvailableRolesLoading(true);
    setAvailableRolesError(null);
    try {
      const roles = await workspaceService.fetchWorkspaceRoles(workspaceSlug);
      setAvailableRoles(roles.filter((role) => role.type === "workspace"));
    } catch (error) {
      setAvailableRolesError(getErrorMessage(error, "获取可用角色失败"));
    } finally {
      setIsAvailableRolesLoading(false);
    }
  }, [workspaceSlug]);

  const getGroupDetail = useCallback(
    (groupId: string): TGroupDetailState => detailByGroupId[groupId] ?? emptyDetail(),
    [detailByGroupId]
  );

  const createGroup = useCallback(
    async (data: { name: string; description?: string }): Promise<IWorkspaceGroup> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      const newGroup = await workspaceService.createWorkspaceGroup(workspaceSlug, data);
      setGroupsState((prev) => ({
        ...prev,
        groups: [newGroup, ...prev.groups],
      }));
      return newGroup;
    },
    [workspaceSlug]
  );

  const updateGroup = useCallback(
    async (groupId: string, data: Partial<{ name: string; description: string }>): Promise<IWorkspaceGroup> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      const updated = await workspaceService.updateWorkspaceGroup(workspaceSlug, groupId, data);
      setGroupsState((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === groupId ? updated : g)),
      }));
      return updated;
    },
    [workspaceSlug]
  );

  const deleteGroup = useCallback(
    async (groupId: string): Promise<void> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      await workspaceService.deleteWorkspaceGroup(workspaceSlug, groupId);
      setGroupsState((prev) => ({
        ...prev,
        groups: prev.groups.filter((g) => g.id !== groupId),
      }));
      setDetailByGroupId((prev) => {
        const next = { ...prev };
        delete next[groupId];
        return next;
      });
    },
    [workspaceSlug]
  );

  const addMembers = useCallback(
    async (groupId: string, memberIds: string[]): Promise<TWorkspaceGroupBulkMutationResult> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      const uniqueMemberIds = [...new Set(memberIds)];
      const results = await Promise.allSettled(
        uniqueMemberIds.map((memberId) => workspaceService.addWorkspaceGroupMember(workspaceSlug, groupId, memberId))
      );
      const succeededEntries: IWorkspaceGroupMember[] = [];
      const result: TWorkspaceGroupBulkMutationResult = { succeededIds: [], failures: [] };

      results.forEach((settledResult, index) => {
        const targetId = uniqueMemberIds[index];
        if (settledResult.status === "fulfilled") {
          succeededEntries.push(settledResult.value);
          result.succeededIds.push(targetId);
        } else {
          result.failures.push({
            targetId,
            message: getErrorMessage(settledResult.reason, "添加成员失败"),
          });
        }
      });

      if (succeededEntries.length > 0) {
        let nextMemberCount: number | null = null;
        setDetailByGroupId((prev) => {
          const current = prev[groupId];
          if (!current) return prev;
          const existingIds = new Set(current.members.map((member) => member.id));
          const nextEntries = succeededEntries.filter((member) => !existingIds.has(member.id));
          const nextMembers = [...current.members, ...nextEntries];
          nextMemberCount = nextMembers.length;
          return {
            ...prev,
            [groupId]: { ...current, members: nextMembers },
          };
        });
        setGroupsState((prev) => ({
          ...prev,
          groups: prev.groups.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  member_count:
                    nextMemberCount ?? group.member_count + succeededEntries.length,
                }
              : group
          ),
        }));
      }

      return result;
    },
    [workspaceSlug]
  );

  const removeMember = useCallback(
    async (groupId: string, membershipId: string): Promise<void> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      await workspaceService.removeWorkspaceGroupMember(workspaceSlug, groupId, membershipId);
      let nextMemberCount: number | null = null;
      setDetailByGroupId((prev) => {
        const cur = prev[groupId];
        if (!cur) return prev;
        const nextMembers = cur.members.filter((m) => m.id !== membershipId);
        nextMemberCount = nextMembers.length;
        return {
          ...prev,
          [groupId]: {
            ...cur,
            members: nextMembers,
          },
        };
      });
      setGroupsState((prev) => ({
        ...prev,
        groups: prev.groups.map((g) =>
          g.id === groupId
            ? { ...g, member_count: nextMemberCount ?? Math.max(0, g.member_count - 1) }
            : g
        ),
      }));
    },
    [workspaceSlug]
  );

  const addRoles = useCallback(
    async (groupId: string, roleIds: string[]): Promise<TWorkspaceGroupBulkMutationResult> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      const uniqueRoleIds = [...new Set(roleIds)];
      const results = await Promise.allSettled(
        uniqueRoleIds.map((roleId) => workspaceService.addWorkspaceGroupRole(workspaceSlug, groupId, roleId))
      );
      const succeededEntries: IWorkspaceGroupRole[] = [];
      const result: TWorkspaceGroupBulkMutationResult = { succeededIds: [], failures: [] };

      results.forEach((settledResult, index) => {
        const targetId = uniqueRoleIds[index];
        if (settledResult.status === "fulfilled") {
          succeededEntries.push(settledResult.value);
          result.succeededIds.push(targetId);
        } else {
          result.failures.push({
            targetId,
            message: getErrorMessage(settledResult.reason, "添加角色失败"),
          });
        }
      });

      if (succeededEntries.length > 0) {
        let nextRoleCount: number | null = null;
        setDetailByGroupId((prev) => {
          const current = prev[groupId];
          if (!current) return prev;
          const existingIds = new Set(current.roles.map((role) => role.id));
          const nextEntries = succeededEntries.filter((role) => !existingIds.has(role.id));
          const nextRoles = [...current.roles, ...nextEntries];
          nextRoleCount = nextRoles.length;
          return {
            ...prev,
            [groupId]: { ...current, roles: nextRoles },
          };
        });
        setGroupsState((prev) => ({
          ...prev,
          groups: prev.groups.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  role_count: nextRoleCount ?? group.role_count + succeededEntries.length,
                }
              : group
          ),
        }));
      }

      return result;
    },
    [workspaceSlug]
  );

  const removeRole = useCallback(
    async (groupId: string, groupRoleId: string): Promise<void> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      await workspaceService.removeWorkspaceGroupRole(workspaceSlug, groupId, groupRoleId);
      let nextRoleCount: number | null = null;
      setDetailByGroupId((prev) => {
        const cur = prev[groupId];
        if (!cur) return prev;
        const nextRoles = cur.roles.filter((r) => r.id !== groupRoleId);
        nextRoleCount = nextRoles.length;
        return {
          ...prev,
          [groupId]: {
            ...cur,
            roles: nextRoles,
          },
        };
      });
      setGroupsState((prev) => ({
        ...prev,
        groups: prev.groups.map((g) =>
          g.id === groupId
            ? { ...g, role_count: nextRoleCount ?? Math.max(0, g.role_count - 1) }
            : g
        ),
      }));
    },
    [workspaceSlug]
  );

  return {
    groups: groupsState.groups,
    isLoading: groupsState.isLoading,
    listError,
    getGroupDetail,
    loadGroupDetail,
    availableRoles,
    isAvailableRolesLoading,
    availableRolesError,
    fetchAvailableRoles,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    addMembers,
    removeMember,
    addRoles,
    removeRole,
  };
};
