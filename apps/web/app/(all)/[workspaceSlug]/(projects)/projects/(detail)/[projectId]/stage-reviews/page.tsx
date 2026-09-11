"use client";

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { StageReviewList, useStageReviewPermissions } from "@/components/stage-reviews";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

function ProjectStageReviewsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const { workspaceUserInfo } = useUserPermissions();
  const { canView } = useStageReviewPermissions(workspaceSlug, projectId);

  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project.name} - ${t("stage_review.page_title")}` : t("stage_review.page_title");

  // 权限是异步拉的，没回来之前不要闪 403
  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <StageReviewList workspaceSlug={workspaceSlug} projectId={projectId} />
    </>
  );
}

export default observer(ProjectStageReviewsPage);
