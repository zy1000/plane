/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  TJobRole,
  TJobRoleLabelUsage,
  TJobRolePayload,
  TJobRoleProjectMembers,
  TJobRoleReference,
} from "@plane/types";
import { JobRoleService } from "@/services/job-role.service";
import { clearJobRolesCache } from "./use-job-roles";
import { useMember } from "./use-member";

const jobRoleService = new JobRoleService();

/** 接口错误转成界面上的一句话；后端的英文 error 不直接露出 */
export const getJobRoleErrorMessage = (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") return fallback;
  const body = error as { code?: string; label?: string[] | string };
  if (body.code === "JOB_ROLE_IN_USE") return "角色正在使用中，移除引用后方可删除";
  const label = Array.isArray(body.label) ? body.label[0] : body.label;
  if (label === "DATA_DICTIONARY_ITEM_ALREADY_EXISTS") return "已存在同名角色";
  return fallback;
};

/**
 * 工作区设置 › 角色列表：持有本页的角色列表（带计数），增删改排序后就地同步，
 * 并清掉 useJobRoles 的缓存，让成员表、审批人选择等之后拿到新角色。
 */
export const useWorkspaceJobRoles = (workspaceSlug: string | undefined) => {
  const [roles, setRoles] = useState<TJobRole[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!workspaceSlug) return;
    setIsLoading(true);
    setError(null);
    try {
      setRoles(await jobRoleService.list(workspaceSlug));
    } catch (loadError) {
      setError(getJobRoleErrorMessage(loadError, "角色加载失败"));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createRole = useCallback(
    async (payload: TJobRolePayload) => {
      if (!workspaceSlug) throw new Error("workspaceSlug is required");
      const role = await jobRoleService.create(workspaceSlug, payload);
      setRoles((current) => [...current, role]);
      clearJobRolesCache(workspaceSlug);
      return role;
    },
    [workspaceSlug]
  );

  const updateRole = useCallback(
    async (roleId: string, payload: TJobRolePayload) => {
      if (!workspaceSlug) throw new Error("workspaceSlug is required");
      const role = await jobRoleService.update(workspaceSlug, roleId, payload);
      setRoles((current) => current.map((item) => (item.id === roleId ? role : item)));
      clearJobRolesCache(workspaceSlug);
      return role;
    },
    [workspaceSlug]
  );

  const deleteRole = useCallback(
    async (roleId: string) => {
      if (!workspaceSlug) throw new Error("workspaceSlug is required");
      await jobRoleService.remove(workspaceSlug, roleId);
      setRoles((current) => current.filter((item) => item.id !== roleId));
      clearJobRolesCache(workspaceSlug);
    },
    [workspaceSlug]
  );

  const reorderRoles = useCallback(
    async (orderedIds: string[]) => {
      if (!workspaceSlug) throw new Error("workspaceSlug is required");
      setRoles(await jobRoleService.reorder(workspaceSlug, orderedIds));
      clearJobRolesCache(workspaceSlug);
    },
    [workspaceSlug]
  );

  return { roles, isLoading, error, reload, createRole, updateRole, deleteRole, reorderRoles };
};

/** 角色详情：角色本身 + 计数；在角色上加人 / 移人时同步成员表里的角色列表 */
export const useJobRoleDetail = (workspaceSlug: string, roleId: string) => {
  const {
    workspace: { workspaceMemberMap, setMemberJobRoleIds },
  } = useMember();
  const [role, setRole] = useState<TJobRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setRole(await jobRoleService.retrieve(workspaceSlug, roleId));
    } catch (loadError) {
      setError(getJobRoleErrorMessage(loadError, "角色加载失败"));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, roleId]);

  useEffect(() => {
    setIsLoading(true);
    void reload();
  }, [reload]);

  const updateRole = useCallback(
    async (payload: TJobRolePayload) => {
      const updated = await jobRoleService.update(workspaceSlug, roleId, payload);
      setRole(updated);
      clearJobRolesCache(workspaceSlug);
      return updated;
    },
    [workspaceSlug, roleId]
  );

  const deleteRole = useCallback(async () => {
    await jobRoleService.remove(workspaceSlug, roleId);
    clearJobRolesCache(workspaceSlug);
  }, [workspaceSlug, roleId]);

  const currentJobRoleIds = (userId: string) => workspaceMemberMap?.[workspaceSlug]?.[userId]?.job_role_ids ?? [];

  const addWorkspaceMembers = async (userIds: string[]) => {
    const { member_ids: addedIds } = await jobRoleService.addWorkspaceMembers(workspaceSlug, roleId, userIds);
    addedIds.forEach((userId) => {
      const current = currentJobRoleIds(userId);
      if (!current.includes(roleId)) setMemberJobRoleIds(workspaceSlug, userId, [...current, roleId]);
    });
    void reload();
    return addedIds;
  };

  const removeWorkspaceMember = async (userId: string) => {
    await jobRoleService.removeWorkspaceMember(workspaceSlug, roleId, userId);
    setMemberJobRoleIds(
      workspaceSlug,
      userId,
      currentJobRoleIds(userId).filter((id) => id !== roleId)
    );
    void reload();
  };

  return { role, isLoading, error, reload, updateRole, deleteRole, addWorkspaceMembers, removeWorkspaceMember };
};

/** 页签数据：切到对应页签（enabled）才拉，拉过一次不再重复 */
const useLazyRoleData = <T>(load: () => Promise<T>, initial: T, enabled: boolean) => {
  const [data, setData] = useState<T>(initial);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await load());
      setIsLoaded(true);
    } catch (loadError) {
      setError(getJobRoleErrorMessage(loadError, "加载失败"));
    } finally {
      setIsLoading(false);
    }
  }, [load]);

  useEffect(() => {
    if (enabled && !isLoaded) void reload();
  }, [enabled, isLoaded, reload]);

  return { data, isLoading: isLoading || (enabled && !isLoaded && !error), error, reload };
};

export const useJobRoleProjectMembers = (workspaceSlug: string, roleId: string, enabled: boolean) => {
  const load = useCallback(() => jobRoleService.listProjectMembers(workspaceSlug, roleId), [workspaceSlug, roleId]);
  return useLazyRoleData<TJobRoleProjectMembers[]>(load, [], enabled);
};

export const useJobRoleReferences = (workspaceSlug: string, roleId: string, enabled: boolean) => {
  const load = useCallback(() => jobRoleService.listReferences(workspaceSlug, roleId), [workspaceSlug, roleId]);
  return useLazyRoleData<TJobRoleReference[]>(load, [], enabled);
};

/** 编辑弹窗打开时取：哪些地方按角色名字引用它（改名会对不上）。roleId 为空 = 新建，不取 */
export const useJobRoleLabelUsage = (workspaceSlug: string | undefined, roleId: string | null) => {
  const [usage, setUsage] = useState<TJobRoleLabelUsage | null>(null);

  useEffect(() => {
    setUsage(null);
    if (!workspaceSlug || !roleId) return;
    let isCancelled = false;
    jobRoleService
      .getLabelUsage(workspaceSlug, roleId)
      .then((response) => {
        if (!isCancelled) setUsage(response);
      })
      .catch(() => {
        // 取不到就不提示，不挡保存
      });
    return () => {
      isCancelled = true;
    };
  }, [workspaceSlug, roleId]);

  return usage;
};
