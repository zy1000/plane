/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef, useState } from "react";
import type {
  TPermissionGroupContent,
  TProjectInheritedGroup,
  TProjectPermissionGroup,
  TProjectPermissionGroupDetail,
} from "@plane/types";
import { ProjectRoleService } from "@/services/project/project-role.service";

const projectRoleService = new ProjectRoleService();

type TGroupPermissionState = {
  data: TProjectPermissionGroupDetail | null;
  isLoading: boolean;
  loaded: boolean;
};

const emptyPermissionState = (): TGroupPermissionState => ({ data: null, isLoading: false, loaded: false });

/**
 * 项目权限组（设置 › 权限组）。``roles`` 是列表行：引用了本项目的模板组 + 本项目自定义组。
 * 成员身上的 custom_role_ids 是本项目权限组 id，对应行的 ``id``（有项目行时 id 就是 project_role_id）。
 */
export const useProjectRoles = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const [roles, setRoles] = useState<TProjectPermissionGroup[]>([]);
  const [inheritedGroups, setInheritedGroups] = useState<TProjectInheritedGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionByGroupId, setPermissionByGroupId] = useState<Record<string, TGroupPermissionState>>({});

  const permissionRef = useRef(permissionByGroupId);
  permissionRef.current = permissionByGroupId;
  const inFlightRef = useRef<Set<string>>(new Set());

  const fetchRoles = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await projectRoleService.list(workspaceSlug, projectId);
      setRoles(data.groups);
      setInheritedGroups(data.inherited_groups ?? []);
    } catch {
      setError("获取项目权限组失败");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  /** 列表里某行换成新数据（改名、保存权限后） */
  const replaceRow = useCallback((previousId: string, row: TProjectPermissionGroup) => {
    setRoles((prev) => prev.map((item) => (item.id === previousId ? row : item)));
  }, []);

  const loadRolePermissions = useCallback(
    async (groupId: string, force = false) => {
      if (!workspaceSlug || !projectId) return;
      if (inFlightRef.current.has(groupId)) return;
      if (!force && permissionRef.current[groupId]?.loaded) return;
      inFlightRef.current.add(groupId);
      setPermissionByGroupId((prev) => ({
        ...prev,
        [groupId]: { ...(prev[groupId] ?? emptyPermissionState()), isLoading: !prev[groupId]?.data },
      }));
      try {
        const data = await projectRoleService.fetchPermissions(workspaceSlug, projectId, groupId);
        setPermissionByGroupId((prev) => ({ ...prev, [groupId]: { data, isLoading: false, loaded: true } }));
      } catch {
        setError("获取权限组的权限失败");
        setPermissionByGroupId((prev) => ({ ...prev, [groupId]: { data: null, isLoading: false, loaded: true } }));
      } finally {
        inFlightRef.current.delete(groupId);
      }
    },
    [workspaceSlug, projectId]
  );

  const getRolePermissionState = useCallback(
    (groupId: string): TGroupPermissionState => permissionByGroupId[groupId] ?? emptyPermissionState(),
    [permissionByGroupId]
  );

  const createRole = useCallback(
    async (data: { name: string; description?: string; copy_from?: string | null }) => {
      if (!workspaceSlug || !projectId) throw new Error("缺少 workspaceSlug 或 projectId");
      const row = await projectRoleService.create(workspaceSlug, projectId, data);
      setRoles((prev) => [...prev, row]);
      return row;
    },
    [workspaceSlug, projectId]
  );

  const updateRole = useCallback(
    async (groupId: string, data: Partial<{ name: string; description: string }>) => {
      if (!workspaceSlug || !projectId) throw new Error("缺少 workspaceSlug 或 projectId");
      const row = await projectRoleService.update(workspaceSlug, projectId, groupId, data);
      replaceRow(groupId, row);
      setPermissionByGroupId((prev) => {
        const current = prev[groupId];
        if (!current?.data) return prev;
        return { ...prev, [groupId]: { ...current, data: { ...current.data, group: row } } };
      });
      return row;
    },
    [workspaceSlug, projectId, replaceRow]
  );

  const deleteRole = useCallback(
    async (groupId: string) => {
      if (!workspaceSlug || !projectId) throw new Error("缺少 workspaceSlug 或 projectId");
      await projectRoleService.destroy(workspaceSlug, projectId, groupId);
      // 删除引用会把模板从列表里拿掉，删本项目组同理，整表重拉最稳
      await fetchRoles();
      setPermissionByGroupId((prev) => {
        const next = { ...prev };
        delete next[groupId];
        return next;
      });
    },
    [workspaceSlug, projectId, fetchRoles]
  );

  /** 整份保存权限内容（详情页底部保存条），成功后同步列表行的权限数 */
  const savePermissions = useCallback(
    async (groupId: string, content: TPermissionGroupContent) => {
      if (!workspaceSlug || !projectId) throw new Error("缺少 workspaceSlug 或 projectId");
      const saved = await projectRoleService.updatePermissions(workspaceSlug, projectId, groupId, content);
      setPermissionByGroupId((prev) => ({ ...prev, [groupId]: { data: saved, isLoading: false, loaded: true } }));
      replaceRow(groupId, saved.group);
      return saved;
    },
    [workspaceSlug, projectId, replaceRow]
  );

  const fetchMemberIds = useCallback(
    async (groupId: string) => {
      if (!workspaceSlug || !projectId) return [];
      return projectRoleService.fetchMemberIds(workspaceSlug, projectId, groupId);
    },
    [workspaceSlug, projectId]
  );

  return {
    roles,
    inheritedGroups,
    isLoading,
    error,
    fetchRoles,
    getRolePermissionState,
    loadRolePermissions,
    createRole,
    updateRole,
    deleteRole,
    savePermissions,
    fetchMemberIds,
  };
};
