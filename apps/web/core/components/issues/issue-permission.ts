/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import type { TIssue } from "@plane/types";
// hooks
import { useUser, useUserPermissions } from "@/hooks/store/user";
// services
import { projectIssueTypesCache } from "@/services/project/project-issue-type.service";
// store
import type { TIssuePermissionAction, TIssueTypeLike } from "@/store/user/base-permissions.store";

/**
 * 判单条工作项权限时用的类型信息，交给 store 的 allowIssuePermission(action, issueType)。
 * 项目类型列表在工作项 / 缺陷页加载时已进缓存，这里同步读，不发请求；
 * 没缓存到时只给 id（按工作项模块判，类型限定只比对 id），最终以后端为准。
 */
export const getIssueTypeForPermission = (
  projectId: string | null | undefined,
  typeId: string | null | undefined
): TIssueTypeLike => {
  if (!typeId) return undefined;
  return (projectId ? projectIssueTypesCache.get(projectId)?.[typeId] : undefined) ?? { id: typeId };
};

type TIssueForPermission = Partial<Pick<TIssue, "project_id" | "type_id" | "assignee_ids">> | null | undefined;

/**
 * 单条工作项的动作权限，口径同后端 has_project_issue_permission：
 * 按类型选 project.issue / project.defect 的 key 并看类型限定；编辑时负责人本人直接放行。
 */
export const useIssuePermission = () => {
  const { allowIssuePermission } = useUserPermissions();
  const { data: currentUser } = useUser();
  const currentUserId = currentUser?.id;

  return useCallback(
    (action: TIssuePermissionAction, issue: TIssueForPermission, workspaceSlug?: string, projectId?: string) => {
      if (action === "edit" && currentUserId && issue?.assignee_ids?.includes(currentUserId)) return true;
      const resolvedProjectId = projectId ?? issue?.project_id ?? undefined;
      return allowIssuePermission(
        action,
        getIssueTypeForPermission(resolvedProjectId, issue?.type_id),
        workspaceSlug,
        resolvedProjectId
      );
    },
    [allowIssuePermission, currentUserId]
  );
};
