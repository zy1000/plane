/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TPermissionGroupContent } from "@plane/types";
import { countChanges } from "@/hooks/store/use-permission-group-detail";
import { useProjectRoles } from "@/hooks/store/use-project-roles";
import { ProjectRoleService } from "@/services/project/project-role.service";

const projectRoleService = new ProjectRoleService();

const toContent = (data: TPermissionGroupContent): TPermissionGroupContent => ({
  permission_keys: data.permission_keys,
  type_limits: data.type_limits ?? {},
});

/**
 * 项目权限组详情页的数据：列表（找当前组、复制来源）、权限内容草稿、组内成员。
 * 与工作区组一致：编辑器改草稿，底部保存条整份 PATCH，可放弃。
 */
export const useProjectPermissionGroupDetail = (workspaceSlug: string, projectId: string, groupId: string) => {
  const roles = useProjectRoles(workspaceSlug, projectId);
  const { fetchRoles, loadRolePermissions, getRolePermissionState, fetchMemberIds, savePermissions } = roles;
  const [memberIds, setMemberIds] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<TPermissionGroupContent | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  useEffect(() => {
    setDraft(null);
    void loadRolePermissions(groupId, true);
  }, [groupId, loadRolePermissions]);

  useEffect(() => {
    let cancelled = false;
    setMemberIds(null);
    fetchMemberIds(groupId)
      .then((ids) => !cancelled && setMemberIds(ids))
      .catch(() => !cancelled && setMemberIds([]));
    return () => {
      cancelled = true;
    };
  }, [groupId, fetchMemberIds]);

  const permissionState = getRolePermissionState(groupId);
  const detail = permissionState.data;
  const base = useMemo(() => (detail ? toContent(detail) : null), [detail]);

  // 读到（或保存后刷新）权限内容时，草稿跟着重置
  useEffect(() => {
    if (base) setDraft(base);
  }, [base]);

  const group = detail?.group ?? roles.roles.find((row) => row.id === groupId) ?? null;
  const changedCount = useMemo(() => (base && draft ? countChanges(base, draft) : 0), [base, draft]);

  const discard = useCallback(() => {
    if (base) setDraft(base);
  }, [base]);

  const save = useCallback(async () => {
    if (!draft) return;
    setIsSaving(true);
    try {
      await savePermissions(groupId, draft);
    } finally {
      setIsSaving(false);
    }
  }, [draft, groupId, savePermissions]);

  /** 「复制自…」：取来源组当前生效的勾选（模板、本项目组都行） */
  const loadCopySource = useCallback(
    async (sourceId: string): Promise<TPermissionGroupContent> =>
      toContent(await projectRoleService.fetchPermissions(workspaceSlug, projectId, sourceId)),
    [workspaceSlug, projectId]
  );

  return {
    ...roles,
    group,
    detail,
    permissionState,
    memberIds,
    draft,
    setDraft,
    changedCount,
    isDirty: changedCount > 0,
    isSaving,
    discard,
    save,
    loadCopySource,
  };
};
