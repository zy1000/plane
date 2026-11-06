/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import { ProjectRoleService } from "@/services/project/project-role.service";

const projectRoleService = new ProjectRoleService();

/** 项目设置 › 权限 › 可访问人员：谁能访问本项目。页签计数和页签内容共用同一个 SWR key */
export const useProjectVisibleMembers = (workspaceSlug: string, projectId: string, enabled = true) => {
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? `PROJECT_VISIBLE_MEMBERS_${workspaceSlug}_${projectId}` : null,
    () => projectRoleService.fetchVisibleMembers(workspaceSlug, projectId),
    { revalidateOnFocus: false }
  );
  return { data, error, isLoading, refresh: mutate };
};
