"use client";

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ReviewTailoringDetailRoot, useReviewTailoringPermissions } from "@/components/review-tailorings";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

function ProjectReviewTailoringDetailPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, tailoringId } = params;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const { workspaceUserInfo } = useUserPermissions();
  const { canView } = useReviewTailoringPermissions(workspaceSlug, projectId);

  const project = getProjectById(projectId);
  const pageTitle = project?.name
    ? `${project.name} - ${t("review_tailoring.page_title")}`
    : t("review_tailoring.page_title");

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <ReviewTailoringDetailRoot
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        tailoringId={tailoringId}
      />
    </>
  );
}

export default observer(ProjectReviewTailoringDetailPage);
