/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { isEqual } from "lodash-es";
import type {
  IPermissionGroupDetail,
  TDataScope,
  TPermissionGroupContent,
  TTemplateProjectRef,
} from "@plane/types";
import { DEFAULT_DATA_SCOPE } from "@plane/types";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? fallback;
  }
  return fallback;
};

/** 改了几个 key（新增 + 去掉 + 类型限定变了的）；项目权限组详情也用它，两边保存条口径一致 */
export const countChanges = (base: TPermissionGroupContent, next: TPermissionGroupContent) => {
  const before = new Set(base.permission_keys);
  const after = new Set(next.permission_keys);
  let count = 0;
  for (const key of after) if (!before.has(key)) count += 1;
  for (const key of before) if (!after.has(key)) count += 1;
  for (const key of after) {
    if (!before.has(key)) continue;
    const a = [...(base.type_limits[key] ?? [])].sort().join(",");
    const b = [...(next.type_limits[key] ?? [])].sort().join(",");
    if (a !== b) count += 1;
  }
  return count;
};

/**
 * 权限组详情的「权限」页签（工作区权限组 / 项目权限模板）：读出权限内容放进草稿，编辑器改草稿，底部保存条整份 PATCH。
 * 不做即改即存：「全部清空」「复制自…」一下改几十个 key，要给人放弃的机会。
 * enabled=false 时不发请求（数据权限没有这一块；kind 还没拿到时也先不拉）。
 */
export const usePermissionGroupDetail = (
  workspaceSlug: string | undefined,
  roleId: string | undefined,
  enabled: boolean = true
) => {
  const [detail, setDetail] = useState<IPermissionGroupDetail | null>(null);
  const [draft, setDraft] = useState<TPermissionGroupContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!workspaceSlug || !roleId || !enabled) return null;
    setIsLoading(true);
    setError(null);
    try {
      const data = await workspaceService.fetchWorkspaceRolePermissions(workspaceSlug, roleId);
      setDetail(data);
      setDraft({ permission_keys: data.permission_keys, type_limits: data.type_limits ?? {} });
      return data;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "获取权限组失败"));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, roleId, enabled]);

  useEffect(() => {
    setDetail(null);
    setDraft(null);
    void reload();
  }, [reload]);

  const base = useMemo<TPermissionGroupContent | null>(
    () => (detail ? { permission_keys: detail.permission_keys, type_limits: detail.type_limits ?? {} } : null),
    [detail]
  );
  const changedCount = useMemo(() => (base && draft ? countChanges(base, draft) : 0), [base, draft]);

  const discard = useCallback(() => {
    if (base) setDraft(base);
  }, [base]);

  const save = useCallback(async () => {
    if (!workspaceSlug || !roleId || !draft) return null;
    setIsSaving(true);
    try {
      const data = await workspaceService.updateWorkspaceRolePermissions(workspaceSlug, roleId, draft);
      setDetail(data);
      setDraft({ permission_keys: data.permission_keys, type_limits: data.type_limits ?? {} });
      return data;
    } finally {
      setIsSaving(false);
    }
  }, [workspaceSlug, roleId, draft]);

  return {
    detail,
    draft,
    setDraft,
    changedCount,
    isDirty: changedCount > 0,
    isLoading,
    isSaving,
    error,
    reload,
    discard,
    save,
  };
};

/** 「复制自…」要读另一个组的权限内容 */
export const fetchPermissionGroupContent = async (
  workspaceSlug: string,
  roleId: string
): Promise<TPermissionGroupContent> => {
  const data = await workspaceService.fetchWorkspaceRolePermissions(workspaceSlug, roleId);
  return { permission_keys: data.permission_keys, type_limits: data.type_limits ?? {} };
};

/**
 * 数据权限详情的「数据权限」页签：项目 / 产品白名单的草稿与整份保存。
 * 只有 kind=data 的组有白名单，enabled=false 时不发请求。
 */
export const usePermissionGroupDataScope = (
  workspaceSlug: string | undefined,
  roleId: string | undefined,
  enabled: boolean = true
) => {
  const [saved, setSaved] = useState<TDataScope | null>(null);
  const [draft, setDraft] = useState<TDataScope | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!workspaceSlug || !roleId || !enabled) return null;
    setIsLoading(true);
    setError(null);
    try {
      const data = await workspaceService.fetchWorkspaceRoleDataScope(workspaceSlug, roleId);
      const scope = { ...DEFAULT_DATA_SCOPE, ...(data.data_scope ?? {}) };
      setSaved(scope);
      setDraft(scope);
      return scope;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "获取数据权限失败"));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, roleId, enabled]);

  useEffect(() => {
    setSaved(null);
    setDraft(null);
    void reload();
  }, [reload]);

  const isDirty = useMemo(() => Boolean(saved && draft && !isEqual(saved, draft)), [saved, draft]);
  /** 保存条上的计数：项目、产品两段各算一处 */
  const changedCount = useMemo(() => {
    if (!saved || !draft) return 0;
    return (["projects", "products"] as const).filter((kind) => !isEqual(saved[kind], draft[kind])).length;
  }, [saved, draft]);

  const discard = useCallback(() => {
    if (saved) setDraft(saved);
  }, [saved]);

  const save = useCallback(async () => {
    if (!workspaceSlug || !roleId || !draft) return null;
    setIsSaving(true);
    try {
      const data = await workspaceService.updateWorkspaceRoleDataScope(workspaceSlug, roleId, draft);
      setSaved(data.data_scope);
      setDraft(data.data_scope);
      return data.data_scope;
    } finally {
      setIsSaving(false);
    }
  }, [workspaceSlug, roleId, draft]);

  return { dataScope: saved, draft, setDraft, isDirty, changedCount, isLoading, isSaving, error, reload, discard, save };
};

/** 工作区权限组 / 数据权限详情的「成员」页签：直绑的人（用户 id）。模板没有成员，enabled 传 false */
export const usePermissionGroupMembers = (
  workspaceSlug: string | undefined,
  roleId: string | undefined,
  enabled: boolean
) => {
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!workspaceSlug || !roleId || !enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await workspaceService.fetchWorkspaceRoleMembers(workspaceSlug, roleId);
      setMemberIds(data.member_ids ?? []);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "获取成员失败"));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, roleId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addMembers = useCallback(
    async (userIds: string[]) => {
      if (!workspaceSlug || !roleId) return;
      const data = await workspaceService.addWorkspaceRoleMembers(workspaceSlug, roleId, userIds);
      setMemberIds(data.member_ids ?? []);
    },
    [workspaceSlug, roleId]
  );

  const removeMember = useCallback(
    async (userId: string) => {
      if (!workspaceSlug || !roleId) return;
      await workspaceService.removeWorkspaceRoleMember(workspaceSlug, roleId, userId);
      setMemberIds((prev) => prev.filter((id) => id !== userId));
    },
    [workspaceSlug, roleId]
  );

  return { memberIds, isLoading, error, reload, addMembers, removeMember };
};

/** 项目权限模板的「引用项目」页：工作区全部项目（带已排除标记），可以把某个项目移出引用 / 恢复 */
export const usePermissionGroupTemplateProjects = (
  workspaceSlug: string | undefined,
  roleId: string | undefined,
  enabled: boolean
) => {
  const [projects, setProjects] = useState<TTemplateProjectRef[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!workspaceSlug || !roleId || !enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await workspaceService.fetchWorkspaceRoleTemplateProjects(workspaceSlug, roleId);
      setProjects(data.projects ?? []);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "获取引用项目失败"));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, roleId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const exclude = useCallback(
    async (projectId: string) => {
      if (!workspaceSlug || !roleId) return;
      await workspaceService.excludeTemplateProject(workspaceSlug, roleId, projectId);
      // 移除时项目里绑到这个组的人已解绑
      setProjects((prev) =>
        prev.map((row) => (row.id === projectId ? { ...row, excluded: true, bound_member_count: 0 } : row))
      );
    },
    [workspaceSlug, roleId]
  );

  const restore = useCallback(
    async (projectId: string) => {
      if (!workspaceSlug || !roleId) return;
      const data = await workspaceService.restoreTemplateProject(workspaceSlug, roleId, projectId);
      setProjects(data.projects ?? []);
    },
    [workspaceSlug, roleId]
  );

  return { projects, isLoading, error, reload, exclude, restore };
};
