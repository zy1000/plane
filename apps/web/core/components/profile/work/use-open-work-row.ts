/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router";
// components
import { reviewTailoringDetailPath, stageReviewDetailPath } from "@/components/reviews/routes";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// types
import type { TUserWorkRow } from "@/types/user-work";

/**
 * 点一行怎么打开：工作项 / 缺陷 / 工作项审批走 peek（审批动作就在工作项详情里），
 * 其余跳到各自的详情页 —— 评审与裁剪表有独立页，需求 / 变更单在产品需求页里用 query 定位。
 */
export const useOpenWorkRow = (workspaceSlug: string) => {
  const navigate = useNavigate();
  const { setPeekIssue } = useIssueDetail();

  return useCallback(
    (row: TUserWorkRow) => {
      const meta = row.meta ?? {};
      switch (row.type) {
        case "work_item":
        case "defect":
          if (row.project_id) setPeekIssue({ workspaceSlug, projectId: row.project_id, issueId: row.id });
          return;
        case "issue_approval":
          if (row.project_id && meta.issue_id)
            setPeekIssue({ workspaceSlug, projectId: row.project_id, issueId: meta.issue_id });
          return;
        case "review":
        case "review_activity":
          if (row.project_id) navigate(stageReviewDetailPath(workspaceSlug, row.project_id, row.id));
          return;
        case "tailoring_approval":
          if (row.project_id) navigate(reviewTailoringDetailPath(workspaceSlug, row.project_id, row.id));
          return;
        case "requirement":
          if (row.product_id) navigate(`/${workspaceSlug}/products/${row.product_id}/requirements?peek=${row.id}`);
          return;
        case "requirement_change":
          if (row.product_id)
            navigate(`/${workspaceSlug}/products/${row.product_id}/requirements?tab=changes&cr=${row.id}`);
          else if (row.project_id)
            navigate(`/${workspaceSlug}/projects/${row.project_id}/requirements?tab=changes&cr=${row.id}`);
          return;
        case "case_execution":
          if (row.project_id && meta.plan_id)
            navigate(
              `/${workspaceSlug}/projects/${row.project_id}/testhub/test-execution?case_id=${meta.case_id ?? ""}&plan_id=${meta.plan_id}`
            );
          return;
        case "plan_review":
          if (row.project_id && meta.plan_id)
            navigate(`/${workspaceSlug}/projects/${row.project_id}/testhub/plan-cases?planId=${meta.plan_id}`);
          return;
        case "case_review":
          if (row.product_id && meta.review_id)
            navigate(
              `/${workspaceSlug}/products/${row.product_id}/testhub/case-review?review_id=${meta.review_id}&case_id=${meta.case_id ?? ""}`
            );
          return;
        default:
          return;
      }
    },
    [navigate, setPeekIssue, workspaceSlug]
  );
};
