/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { useTemplatePermissions } from "@/components/template-management/permissions";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { getSchemeIdFromScopeKey } from "@/services/project/issue-scheme-scope";

/**
 * 工作项配置（类型 / 字段 / 状态 / 工作流）能不能改。scopeKey 见 issue-scheme-scope.ts：
 * - 方案作用域（模板中心维护模式方案）：看研发模式的管理权限，不看项目权限 key
 * - 项目跟随研发模式：一律只读（后端同样拦，去模板中心改或先切换为项目自定义）
 * - 项目自定义：照旧按传入的项目权限 key 判断
 */
export const useIssueConfigPermission = (workspaceSlug: string, scopeKey: string) => {
  const { allowProjectPermissionKeys } = useUserPermissions();
  const { canManageDevModes } = useTemplatePermissions(workspaceSlug);
  const { getProjectById } = useProject();

  const schemeId = getSchemeIdFromScopeKey(scopeKey);
  const project = schemeId ? undefined : getProjectById(scopeKey);
  const isFollowingDevMode = !schemeId && project?.issue_scheme_detail?.is_project_owned === false;

  const canEdit = useCallback(
    (permissionKeys: string[]) => {
      if (schemeId) return canManageDevModes;
      if (isFollowingDevMode) return false;
      return allowProjectPermissionKeys(permissionKeys, workspaceSlug, scopeKey);
    },
    [schemeId, canManageDevModes, isFollowingDevMode, allowProjectPermissionKeys, workspaceSlug, scopeKey]
  );

  return { schemeId, isSchemeScope: !!schemeId, isFollowingDevMode, canEdit };
};
