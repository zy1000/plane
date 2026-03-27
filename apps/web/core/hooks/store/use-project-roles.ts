/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef, useState } from "react";
import type { IPermission, IProjectRole, IProjectRolePermissionData } from "@plane/types";
import { ProjectRoleService } from "@/services/project/project-role.service";

const projectRoleService = new ProjectRoleService();

type TRolePermissionState = {
  data: IProjectRolePermissionData | null;
  isLoading: boolean;
  loaded: boolean;
};

const emptyPermissionState = (): TRolePermissionState => ({
  data: null,
  isLoading: false,
  loaded: false,
});

export const useProjectRoles = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const [roles, setRoles] = useState<IProjectRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [permissionByRoleId, setPermissionByRoleId] = useState<Record<string, TRolePermissionState>>({});
  const [error, setError] = useState<string | null>(null);

  const permissionRef = useRef(permissionByRoleId);
  permissionRef.current = permissionByRoleId;
  const inFlightRef = useRef<Set<string>>(new Set());

  const fetchRoles = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await projectRoleService.list(workspaceSlug, projectId);
      setRoles(data);
    } catch {
      setError("获取项目角色列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  const loadRolePermissions = useCallback(
    async (roleId: string) => {
      if (!workspaceSlug || !projectId) return;
      if (inFlightRef.current.has(roleId)) return;
      inFlightRef.current.add(roleId);

      setPermissionByRoleId((prev) => ({
        ...prev,
        [roleId]: { ...(prev[roleId] ?? emptyPermissionState()), isLoading: true },
      }));

      try {
        const data = await projectRoleService.fetchPermissions(workspaceSlug, projectId, roleId);
        setPermissionByRoleId((prev) => ({
          ...prev,
          [roleId]: { data, isLoading: false, loaded: true },
        }));
      } catch {
        setError("获取项目角色权限失败");
        setPermissionByRoleId((prev) => ({
          ...prev,
          [roleId]: { data: null, isLoading: false, loaded: true },
        }));
      } finally {
        inFlightRef.current.delete(roleId);
      }
    },
    [workspaceSlug, projectId]
  );

  const getRolePermissionState = useCallback(
    (roleId: string): TRolePermissionState => permissionByRoleId[roleId] ?? emptyPermissionState(),
    [permissionByRoleId]
  );

  const createRole = useCallback(
    async (data: { name: string; description?: string }): Promise<IProjectRole> => {
      if (!workspaceSlug || !projectId) throw new Error("缺少 workspaceSlug 或 projectId");
      const newRole = await projectRoleService.create(workspaceSlug, projectId, data);
      setRoles((prev) => [newRole, ...prev]);
      return newRole;
    },
    [workspaceSlug, projectId]
  );

  const updateRole = useCallback(
    async (roleId: string, data: Partial<{ name: string; description: string }>): Promise<IProjectRole> => {
      if (!workspaceSlug || !projectId) throw new Error("缺少 workspaceSlug 或 projectId");
      const updated = await projectRoleService.update(workspaceSlug, projectId, roleId, data);
      setRoles((prev) => prev.map((r) => (r.id === roleId ? updated : r)));
      setPermissionByRoleId((prev) => {
        const cur = prev[roleId];
        if (!cur?.data) return prev;
        return { ...prev, [roleId]: { ...cur, data: { ...cur.data, role: updated } } };
      });
      return updated;
    },
    [workspaceSlug, projectId]
  );

  const deleteRole = useCallback(
    async (roleId: string): Promise<void> => {
      if (!workspaceSlug || !projectId) throw new Error("缺少 workspaceSlug 或 projectId");
      await projectRoleService.destroy(workspaceSlug, projectId, roleId);
      setRoles((prev) => prev.filter((r) => r.id !== roleId));
      setPermissionByRoleId((prev) => {
        const next = { ...prev };
        delete next[roleId];
        return next;
      });
    },
    [workspaceSlug, projectId]
  );

  /** 从工作区角色模板导入（独立副本） */
  const importFromTemplate = useCallback(
    async (workspaceRoleId: string): Promise<IProjectRole> => {
      if (!workspaceSlug || !projectId) throw new Error("缺少 workspaceSlug 或 projectId");
      const newRole = await projectRoleService.importFromTemplate(workspaceSlug, projectId, {
        workspace_role_id: workspaceRoleId,
      });
      setRoles((prev) => [newRole, ...prev]);
      return newRole;
    },
    [workspaceSlug, projectId]
  );

  const togglePermission = useCallback(
    async (roleId: string, permissionKey: string): Promise<void> => {
      if (!workspaceSlug || !projectId) throw new Error("缺少 workspaceSlug 或 projectId");

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
          data: { ...currentState.data!, permission_keys: newKeys, permissions: optimisticPermissions },
          isLoading: false,
          loaded: true,
        },
      }));

      try {
        const updated = await projectRoleService.updatePermissions(workspaceSlug, projectId, roleId, newKeys);
        setPermissionByRoleId((prev) => ({
          ...prev,
          [roleId]: { data: updated, isLoading: false, loaded: true },
        }));
      } catch {
        setPermissionByRoleId((prev) => ({
          ...prev,
          [roleId]: { data: currentState.data, isLoading: false, loaded: true },
        }));
        throw new Error("更新权限失败，请重试");
      }
    },
    [workspaceSlug, projectId]
  );

  return {
    roles,
    isLoading,
    error,
    fetchRoles,
    getRolePermissionState,
    loadRolePermissions,
    createRole,
    updateRole,
    deleteRole,
    importFromTemplate,
    togglePermission,
  };
};
