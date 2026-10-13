/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueServiceType } from "@plane/types";
// components
import { DEFECT_CATEGORY_NAME } from "@/components/risks/constants";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";

/**
 * 这条工作项是不是「缺陷」：看工作项类型的类别名，口径同缺陷页与后端 utils/risk.py。
 * 风险 ↔ 缺陷的关联区块与快捷操作按钮都要先过这一关，非缺陷调接口会 400。
 * 类型还没拉到时返回 false（区块先不渲染，拉到后自然补上）。
 */
export const useIsDefectWorkItem = (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  issueServiceType: TIssueServiceType
) => {
  const {
    issue: { getIssueById },
  } = useIssueDetail(issueServiceType);
  const { issueTypes } = useProjectIssueTypes(workspaceSlug, projectId);
  const issue = getIssueById(issueId);
  if (!issue?.type_id || !issueTypes) return false;
  return issueTypes.find((type) => type.id === issue.type_id)?.category_name === DEFECT_CATEGORY_NAME;
};
