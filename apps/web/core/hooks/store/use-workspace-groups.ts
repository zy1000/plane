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
};

const emptyDetail = (): TGroupDetailState => ({
  members: [],
  roles: [],
  isLoading: false,
  loaded: false,
});

export const useWorkspaceGroups = (workspaceSlug: string | undefined) => {
  const [groupsState, setGroupsState] = useState<TGroupsState>({
    groups: [],
    isLoading: false,
  });
  const [detailByGroupId, setDetailByGroupId] = useState<Record<string, TGroupDetailState>>({});
  const [availableRoles, setAvailableRoles] = useState<IWorkspaceRole[]>([]);
  const [error, setError] = useState<string | null>(null);

  const detailRef = useRef(detailByGroupId);
  detailRef.current = detailByGroupId;
  const inFlightRef = useRef<Set<string>>(new Set());

  const fetchGroups = useCallback(async () => {
    if (!workspaceSlug) return;
    setGroupsState((prev) => ({ ...prev, isLoading: true }));
    setError(null);
    try {
      const data = await workspaceService.fetchWorkspaceGroups(workspaceSlug);
      setGroupsState({ groups: data, isLoading: false });
    } catch {
      setError("获取团队列表失败");
      setGroupsState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [workspaceSlug]);

  const loadGroupDetail = useCallback(
    async (groupId: string) => {
      if (!workspaceSlug) return;
      if (detailRef.current[groupId]?.loaded) return;
      if (inFlightRef.current.has(groupId)) return;
      inFlightRef.current.add(groupId);

      setDetailByGroupId((prev) => ({
        ...prev,
        [groupId]: {
          ...(prev[groupId] ?? emptyDetail()),
          isLoading: true,
        },
      }));

      try {
        const [members, roles] = await Promise.all([
          workspaceService.fetchWorkspaceGroupMembers(workspaceSlug, groupId),
          workspaceService.fetchWorkspaceGroupRoles(workspaceSlug, groupId),
        ]);
        setDetailByGroupId((prev) => ({
          ...prev,
          [groupId]: { members, roles, isLoading: false, loaded: true },
        }));
      } catch {
        setError("获取团队详情失败");
        setDetailByGroupId((prev) => ({
          ...prev,
          [groupId]: { members: [], roles: [], isLoading: false, loaded: true },
        }));
      } finally {
        inFlightRef.current.delete(groupId);
      }
    },
    [workspaceSlug]
  );

  const fetchAvailableRoles = useCallback(async () => {
    if (!workspaceSlug) return;
    try {
      const roles = await workspaceService.fetchWorkspaceRoles(workspaceSlug);
      setAvailableRoles(roles.filter((role) => role.type === "workspace"));
    } catch {
      // 静默失败
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

  const addMember = useCallback(
    async (groupId: string, memberId: string): Promise<void> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      const newEntry = await workspaceService.addWorkspaceGroupMember(workspaceSlug, groupId, memberId);
      setDetailByGroupId((prev) => {
        const cur = prev[groupId];
        if (!cur) return prev;
        return {
          ...prev,
          [groupId]: { ...cur, members: [...cur.members, newEntry] },
        };
      });
      setGroupsState((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === groupId ? { ...g, member_count: g.member_count + 1 } : g)),
      }));
    },
    [workspaceSlug]
  );

  const removeMember = useCallback(
    async (groupId: string, membershipId: string): Promise<void> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      await workspaceService.removeWorkspaceGroupMember(workspaceSlug, groupId, membershipId);
      setDetailByGroupId((prev) => {
        const cur = prev[groupId];
        if (!cur) return prev;
        return {
          ...prev,
          [groupId]: {
            ...cur,
            members: cur.members.filter((m) => m.id !== membershipId),
          },
        };
      });
      setGroupsState((prev) => ({
        ...prev,
        groups: prev.groups.map((g) =>
          g.id === groupId ? { ...g, member_count: Math.max(0, g.member_count - 1) } : g
        ),
      }));
    },
    [workspaceSlug]
  );

  const addRole = useCallback(
    async (groupId: string, roleId: string): Promise<void> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      const newEntry = await workspaceService.addWorkspaceGroupRole(workspaceSlug, groupId, roleId);
      setDetailByGroupId((prev) => {
        const cur = prev[groupId];
        if (!cur) return prev;
        return {
          ...prev,
          [groupId]: { ...cur, roles: [...cur.roles, newEntry] },
        };
      });
      setGroupsState((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === groupId ? { ...g, role_count: g.role_count + 1 } : g)),
      }));
    },
    [workspaceSlug]
  );

  const removeRole = useCallback(
    async (groupId: string, groupRoleId: string): Promise<void> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      await workspaceService.removeWorkspaceGroupRole(workspaceSlug, groupId, groupRoleId);
      setDetailByGroupId((prev) => {
        const cur = prev[groupId];
        if (!cur) return prev;
        return {
          ...prev,
          [groupId]: {
            ...cur,
            roles: cur.roles.filter((r) => r.id !== groupRoleId),
          },
        };
      });
      setGroupsState((prev) => ({
        ...prev,
        groups: prev.groups.map((g) =>
          g.id === groupId ? { ...g, role_count: Math.max(0, g.role_count - 1) } : g
        ),
      }));
    },
    [workspaceSlug]
  );

  return {
    groups: groupsState.groups,
    isLoading: groupsState.isLoading,
    error,
    getGroupDetail,
    loadGroupDetail,
    availableRoles,
    fetchAvailableRoles,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    addMember,
    removeMember,
    addRole,
    removeRole,
  };
};
