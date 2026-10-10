/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { TIssueType } from "@/services/project";
import { ProjectIssueTypeService } from "@/services/project";

const issueTypeService = new ProjectIssueTypeService();

/** 项目的工作项类型（服务里按项目缓存），供类型筛选和行首类型图标用 */
export const useProjectIssueTypes = (workspaceSlug: string, projectId: string) => {
  const [types, setTypes] = useState<TIssueType[]>([]);
  useEffect(() => {
    let alive = true;
    issueTypeService
      .fetchProjectIssueTypes(workspaceSlug, projectId)
      .then((result) => alive && setTypes(result ?? []))
      .catch(() => alive && setTypes([]));
    return () => {
      alive = false;
    };
  }, [projectId, workspaceSlug]);
  return types;
};
