/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { IPermissionGroup, TPermissionGroupKind } from "@plane/types";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

// 按工作区缓存一份列表并广播给所有用到它的组件：成员表、权限组页、团队页、审批人选择器同时挂着时，
// 任何一处拉取 / 增删改，其它地方立即看到同一份（SWR 同 key 只会调用一次 fetcher）
const rolesCacheBySlug = new Map<string, IPermissionGroup[]>();
const listenersBySlug = new Map<string, Set<(roles: IPermissionGroup[]) => void>>();

const publishRoles = (slug: string, roles: IPermissionGroup[]) => {
  rolesCacheBySlug.set(slug, roles);
  listenersBySlug.get(slug)?.forEach((listener) => listener(roles));
};

/**
 * 工作区下的权限组列表（三类都在一份里，按 kind 分：工作区权限组 / 项目权限模板 / 数据权限）与增删改。
 * 每行带按类型给的统计（人数 / 权限数 / 数据权限摘要 / 引用项目数）；权限内容与白名单的读写在 use-permission-group-detail.ts。
 */
export const useWorkspaceRoles = (workspaceSlug: string | undefined) => {
  const [roles, setRoles] = useState<IPermissionGroup[]>(() =>
    workspaceSlug ? (rolesCacheBySlug.get(workspaceSlug) ?? []) : []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceSlug) return;
    setRoles(rolesCacheBySlug.get(workspaceSlug) ?? []);
    const listeners = listenersBySlug.get(workspaceSlug) ?? new Set();
    listeners.add(setRoles);
    listenersBySlug.set(workspaceSlug, listeners);
    return () => {
      listeners.delete(setRoles);
    };
  }, [workspaceSlug]);

  const commit = useCallback(
    (updater: (prev: IPermissionGroup[]) => IPermissionGroup[]) => {
      if (!workspaceSlug) return;
      publishRoles(workspaceSlug, updater(rolesCacheBySlug.get(workspaceSlug) ?? []));
    },
    [workspaceSlug]
  );

  const fetchRoles = useCallback(async () => {
    if (!workspaceSlug) return [];
    setIsLoading(true);
    setError(null);
    try {
      const data = await workspaceService.fetchWorkspaceRoles(workspaceSlug);
      commit(() => data);
      return data;
    } catch {
      setError("获取权限组失败");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, commit]);

  /** 按 kind 分好的三份（缓存仍是一份全量） */
  const groupsByKind = useMemo<Record<TPermissionGroupKind, IPermissionGroup[]>>(() => {
    const result: Record<TPermissionGroupKind, IPermissionGroup[]> = { workspace: [], project_template: [], data: [] };
    for (const role of roles) result[role.kind]?.push(role);
    return result;
  }, [roles]);

  /** kind 创建后不可改；copy_from 只接受同 kind 的组 */
  const createRole = useCallback(
    async (data: {
      name: string;
      description?: string;
      kind: TPermissionGroupKind;
      copy_from?: string | null;
    }): Promise<IPermissionGroup> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      const created = await workspaceService.createWorkspaceRole(workspaceSlug, data);
      commit((prev) => [...prev, created]);
      return created;
    },
    [workspaceSlug, commit]
  );

  const updateRole = useCallback(
    async (roleId: string, data: Partial<{ name: string; description: string }>): Promise<IPermissionGroup> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      const updated = await workspaceService.updateWorkspaceRole(workspaceSlug, roleId, data);
      commit((prev) => prev.map((role) => (role.id === roleId ? updated : role)));
      return updated;
    },
    [workspaceSlug, commit]
  );

  const deleteRole = useCallback(
    async (roleId: string): Promise<void> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      await workspaceService.deleteWorkspaceRole(workspaceSlug, roleId);
      commit((prev) => prev.filter((role) => role.id !== roleId));
    },
    [workspaceSlug, commit]
  );

  /** 详情页改了权限 / 成员 / 数据权限后，把列表里这一行的统计刷新成最新 */
  const refreshRole = useCallback(
    async (roleId: string): Promise<IPermissionGroup | null> => {
      if (!workspaceSlug) return null;
      const fresh = await workspaceService.fetchWorkspaceRole(workspaceSlug, roleId);
      commit((prev) =>
        prev.some((role) => role.id === roleId)
          ? prev.map((role) => (role.id === roleId ? fresh : role))
          : [...prev, fresh]
      );
      return fresh;
    },
    [workspaceSlug, commit]
  );

  return {
    roles,
    groupsByKind,
    isLoading,
    error,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    refreshRole,
  };
};
