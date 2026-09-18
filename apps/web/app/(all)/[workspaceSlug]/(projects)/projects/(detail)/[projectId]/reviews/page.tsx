"use client";

import { observer } from "mobx-react";
import { Navigate } from "react-router";
import { useReviewTailoringPermissions } from "@/components/review-tailorings";
import { reviewTailoringsPath, stageReviewsPath } from "@/components/reviews";
import { useStageReviewPermissions } from "@/components/stage-reviews";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

/**
 * 「评审」标签的裸路径：转到默认子页。
 * 只配了裁剪权限的人直接落到裁剪页，免得先被送进阶段评审再吃一个 403。
 */
function ProjectReviewsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { workspaceUserInfo } = useUserPermissions();
  const { canView: canViewStageReviews } = useStageReviewPermissions(workspaceSlug, projectId);
  const { canView: canViewTailorings } = useReviewTailoringPermissions(workspaceSlug, projectId);

  // 权限是异步拉的，没回来之前先别跳
  if (!workspaceUserInfo) return null;

  const target =
    !canViewStageReviews && canViewTailorings
      ? reviewTailoringsPath(workspaceSlug, projectId)
      : stageReviewsPath(workspaceSlug, projectId);

  return <Navigate to={target} replace />;
}

export default observer(ProjectReviewsPage);
