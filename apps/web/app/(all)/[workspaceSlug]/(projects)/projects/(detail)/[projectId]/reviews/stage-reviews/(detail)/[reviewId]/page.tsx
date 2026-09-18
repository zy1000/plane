"use client";

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { StageReviewDetailRoot, useStageReviewPermissions } from "@/components/stage-reviews";
import { useProject } from "@/hooks/store/use-project";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import type { Route } from "./+types/page";

/** 一条评审的独立详情页：抽屉里「在新页面中打开」来这里，内容与抽屉同一套 */
function ProjectStageReviewDetailPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, reviewId } = params;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const { getWorkspaceBySlug } = useWorkspace();
  const { data: currentUser } = useUser();
  const { workspaceUserInfo } = useUserPermissions();
  const { canView, canManage } = useStageReviewPermissions(workspaceSlug, projectId);

  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project.name} - ${t("stage_review.page_title")}` : t("stage_review.page_title");

  // 权限是异步拉的，没回来之前不要闪 403
  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="flex h-full flex-col">
        <StageReviewDetailRoot
          variant="page"
          workspaceSlug={workspaceSlug}
          workspaceId={getWorkspaceBySlug(workspaceSlug)?.id ?? ""}
          projectId={projectId}
          reviewId={reviewId}
          canManage={canManage}
          currentUserId={currentUser?.id}
        />
      </div>
    </>
  );
}

export default observer(ProjectStageReviewDetailPage);
