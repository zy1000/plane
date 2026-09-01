/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type {
  IPermission,
  IRolePermissionData,
  IWorkspaceRole,
  IWorkspaceRoleSyncToProjectsResult,
  TWorkspaceRoleType,
} from "@plane/types";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

type TRolesState = {
  roles: IWorkspaceRole[];
  isLoading: boolean;
};

type TRolePermissionState = {
  data: IRolePermissionData | null;
  isLoading: boolean;
  loaded: boolean;
};

type TWorkspaceRolesCache = {
  roles: IWorkspaceRole[];
  permissions: Record<string, TRolePermissionState>;
};

const workspaceRolesCacheBySlug = new Map<string, TWorkspaceRolesCache>();

const getWorkspaceRolesCache = (slug: string): TWorkspaceRolesCache => {
  let cache = workspaceRolesCacheBySlug.get(slug);
  if (!cache) {
    cache = { roles: [], permissions: {} };
    workspaceRolesCacheBySlug.set(slug, cache);
  }
  return cache;
};

const emptyPermissionState = (): TRolePermissionState => ({
  data: null,
  isLoading: false,
  loaded: false,
});

/**
 * 统一管理工作区下所有角色（workspace 角色 + project_template 模板）。
 * 通过 `roleType` 参数在消费层按类型过滤展示。
 */
export const useWorkspaceRoles = (workspaceSlug: string | undefined, roleType?: TWorkspaceRoleType) => {
  const cache = workspaceSlug ? getWorkspaceRolesCache(workspaceSlug) : null;

  const [rolesState, setRolesState] = useState<TRolesState>(() => ({
    roles: cache?.roles ?? [],
    isLoading: false,
  }));
  const [permissionByRoleId, setPermissionByRoleId] = useState<Record<string, TRolePermissionState>>(
    () => ({ ...(cache?.permissions ?? {}) })
  );
  const [error, setError] = useState<string | null>(null);

  const permissionRef = useRef(permissionByRoleId);
  permissionRef.current = permissionByRoleId;
  const inFlightRef = useRef<Set<string>>(new Set());

  const syncRolesCache = useCallback(
    (roles: IWorkspaceRole[]) => {
      if (workspaceSlug) {
        getWorkspaceRolesCache(workspaceSlug).roles = roles;
      }
    },
    [workspaceSlug]
  );

  const updatePermissionByRoleId = useCallback(
    (updater: (prev: Record<string, TRolePermissionState>) => Record<string, TRolePermissionState>) => {
      setPermissionByRoleId((prev) => {
        const next = updater(prev);
        if (workspaceSlug) {
          getWorkspaceRolesCache(workspaceSlug).permissions = next;
        }
        return next;
      });
    },
    [workspaceSlug]
  );

  const fetchRoles = useCallback(async () => {
    if (!workspaceSlug) return;
    setRolesState((prev) => ({ ...prev, isLoading: true }));
    setError(null);
    try {
      const data = await workspaceService.fetchWorkspaceRoles(workspaceSlug);
      syncRolesCache(data);
      setRolesState({ roles: data, isLoading: false });
    } catch {
      setError("获取角色列表失败");
      setRolesState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [workspaceSlug, syncRolesCache]);

  // 按 roleType 过滤，未传则返回全量
  const roles = useMemo(
    () => (roleType ? rolesState.roles.filter((r) => r.type === roleType) : rolesState.roles),
    [rolesState.roles, roleType]
  );

  const loadRolePermissions = useCallback(
    async (roleId: string) => {
      if (!workspaceSlug) return;
      // 不根据 loaded 短路：切回同一角色或从其它标签页返回时仍需与服务端对齐
      if (inFlightRef.current.has(roleId)) return;
      inFlightRef.current.add(roleId);

      updatePermissionByRoleId((prev) => {
        const existing = prev[roleId];
        return {
          ...prev,
          [roleId]: {
            ...(existing ?? emptyPermissionState()),
            isLoading: !existing?.data,
          },
        };
      });

      try {
        const data = await workspaceService.fetchWorkspaceRolePermissions(workspaceSlug, roleId);
        updatePermissionByRoleId((prev) => ({
          ...prev,
          [roleId]: { data, isLoading: false, loaded: true },
        }));
      } catch {
        setError("获取角色权限失败");
        updatePermissionByRoleId((prev) => ({
          ...prev,
          [roleId]: { data: null, isLoading: false, loaded: true },
        }));
      } finally {
        inFlightRef.current.delete(roleId);
      }
    },
    [workspaceSlug, updatePermissionByRoleId]
  );

  const getRolePermissionState = useCallback(
    (roleId: string): TRolePermissionState => permissionByRoleId[roleId] ?? emptyPermissionState(),
    [permissionByRoleId]
  );

  const createRole = useCallback(
    async (data: { name: string; description?: string; type?: TWorkspaceRoleType }): Promise<IWorkspaceRole> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      // 若调用者未指定 type，则使用当前 hook 的 roleType（如有），否则默认 workspace
      const payload = { ...data, type: data.type ?? roleType ?? "workspace" };
      const newRole = await workspaceService.createWorkspaceRole(workspaceSlug, payload);
      setRolesState((prev) => {
        const nextRoles = [newRole, ...prev.roles];
        syncRolesCache(nextRoles);
        return { ...prev, roles: nextRoles };
      });
      return newRole;
    },
    [workspaceSlug, roleType, syncRolesCache]
  );

  const updateRole = useCallback(
    async (roleId: string, data: Partial<{ name: string; description: string }>): Promise<IWorkspaceRole> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      const updated = await workspaceService.updateWorkspaceRole(workspaceSlug, roleId, data);
      setRolesState((prev) => {
        const nextRoles = prev.roles.map((r) => (r.id === roleId ? updated : r));
        syncRolesCache(nextRoles);
        return { ...prev, roles: nextRoles };
      });
      // Update cached permission data role info too
      updatePermissionByRoleId((prev) => {
        const cur = prev[roleId];
        if (!cur?.data) return prev;
        return {
          ...prev,
          [roleId]: { ...cur, data: { ...cur.data, role: updated } },
        };
      });
      return updated;
    },
    [workspaceSlug, syncRolesCache, updatePermissionByRoleId]
  );

  const deleteRole = useCallback(
    async (roleId: string): Promise<void> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      await workspaceService.deleteWorkspaceRole(workspaceSlug, roleId);
      setRolesState((prev) => {
        const nextRoles = prev.roles.filter((r) => r.id !== roleId);
        syncRolesCache(nextRoles);
        return { ...prev, roles: nextRoles };
      });
      updatePermissionByRoleId((prev) => {
        const next = { ...prev };
        delete next[roleId];
        return next;
      });
    },
    [workspaceSlug, syncRolesCache, updatePermissionByRoleId]
  );

  const togglePermission = useCallback(
    async (roleId: string, permissionKey: string): Promise<void> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");

      const currentState = permissionRef.current[roleId];
      if (!currentState?.data) return;

      const currentKeys = currentState.data.permission_keys;
      const isCurrentlyBound = currentKeys.includes(permissionKey);
      const newKeys = isCurrentlyBound
        ? currentKeys.filter((k) => k !== permissionKey)
        : [...currentKeys, permissionKey];

      // Optimistic update
      const optimisticPermissions: IPermission[] = currentState.data.permissions.map((p) => ({
        ...p,
        is_bound: newKeys.includes(p.key),
      }));
      updatePermissionByRoleId((prev) => ({
        ...prev,
        [roleId]: {
          ...prev[roleId],
          data: {
            ...currentState.data!,
            permission_keys: newKeys,
            permissions: optimisticPermissions,
          },
          isLoading: false,
          loaded: true,
        },
      }));

      try {
        const updated = await workspaceService.updateWorkspaceRolePermissions(workspaceSlug, roleId, newKeys);
        updatePermissionByRoleId((prev) => ({
          ...prev,
          [roleId]: { data: updated, isLoading: false, loaded: true },
        }));
      } catch {
        // Rollback on error
        updatePermissionByRoleId((prev) => ({
          ...prev,
          [roleId]: { data: currentState.data, isLoading: false, loaded: true },
        }));
        throw new Error("更新权限失败，请重试");
      }
    },
    [workspaceSlug, updatePermissionByRoleId]
  );

  const syncRoleToProjects = useCallback(
    async (roleId: string): Promise<IWorkspaceRoleSyncToProjectsResult> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      // 只改各项目的同名角色，模板本身没变，本地状态无需更新
      return workspaceService.syncWorkspaceRoleToProjects(workspaceSlug, roleId);
    },
    [workspaceSlug]
  );

  return {
    roles,
    isLoading: rolesState.isLoading,
    error,
    getRolePermissionState,
    loadRolePermissions,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    togglePermission,
    syncRoleToProjects,
  };
};
