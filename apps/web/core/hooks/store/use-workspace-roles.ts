/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { IPermission, IRolePermissionData, IWorkspaceRole, TWorkspaceRoleType } from "@plane/types";
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
  const [rolesState, setRolesState] = useState<TRolesState>({
    roles: [],
    isLoading: false,
  });
  const [permissionByRoleId, setPermissionByRoleId] = useState<Record<string, TRolePermissionState>>({});
  const [error, setError] = useState<string | null>(null);

  const permissionRef = useRef(permissionByRoleId);
  permissionRef.current = permissionByRoleId;
  const inFlightRef = useRef<Set<string>>(new Set());

  const fetchRoles = useCallback(async () => {
    if (!workspaceSlug) return;
    setRolesState((prev) => ({ ...prev, isLoading: true }));
    setError(null);
    try {
      const data = await workspaceService.fetchWorkspaceRoles(workspaceSlug);
      setRolesState({ roles: data, isLoading: false });
    } catch {
      setError("获取角色列表失败");
      setRolesState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [workspaceSlug]);

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

      setPermissionByRoleId((prev) => ({
        ...prev,
        [roleId]: {
          ...(prev[roleId] ?? emptyPermissionState()),
          isLoading: true,
        },
      }));

      try {
        const data = await workspaceService.fetchWorkspaceRolePermissions(workspaceSlug, roleId);
        setPermissionByRoleId((prev) => ({
          ...prev,
          [roleId]: { data, isLoading: false, loaded: true },
        }));
      } catch {
        setError("获取角色权限失败");
        setPermissionByRoleId((prev) => ({
          ...prev,
          [roleId]: { data: null, isLoading: false, loaded: true },
        }));
      } finally {
        inFlightRef.current.delete(roleId);
      }
    },
    [workspaceSlug]
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
      setRolesState((prev) => ({
        ...prev,
        roles: [newRole, ...prev.roles],
      }));
      return newRole;
    },
    [workspaceSlug, roleType]
  );

  const updateRole = useCallback(
    async (roleId: string, data: Partial<{ name: string; description: string }>): Promise<IWorkspaceRole> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      const updated = await workspaceService.updateWorkspaceRole(workspaceSlug, roleId, data);
      setRolesState((prev) => ({
        ...prev,
        roles: prev.roles.map((r) => (r.id === roleId ? updated : r)),
      }));
      // Update cached permission data role info too
      setPermissionByRoleId((prev) => {
        const cur = prev[roleId];
        if (!cur?.data) return prev;
        return {
          ...prev,
          [roleId]: { ...cur, data: { ...cur.data, role: updated } },
        };
      });
      return updated;
    },
    [workspaceSlug]
  );

  const deleteRole = useCallback(
    async (roleId: string): Promise<void> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      await workspaceService.deleteWorkspaceRole(workspaceSlug, roleId);
      setRolesState((prev) => ({
        ...prev,
        roles: prev.roles.filter((r) => r.id !== roleId),
      }));
      setPermissionByRoleId((prev) => {
        const next = { ...prev };
        delete next[roleId];
        return next;
      });
    },
    [workspaceSlug]
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
      setPermissionByRoleId((prev) => ({
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
        setPermissionByRoleId((prev) => ({
          ...prev,
          [roleId]: { data: updated, isLoading: false, loaded: true },
        }));
      } catch {
        // Rollback on error
        setPermissionByRoleId((prev) => ({
          ...prev,
          [roleId]: { data: currentState.data, isLoading: false, loaded: true },
        }));
        throw new Error("更新权限失败，请重试");
      }
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
  };
};
