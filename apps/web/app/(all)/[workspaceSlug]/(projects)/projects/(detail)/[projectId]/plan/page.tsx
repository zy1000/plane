"use client";

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ProjectPlan, useProjectStagePermissions } from "@/components/project-stages";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

/** 规划的数据权限跟阶段一致（后端 stages/plan/ 同阶段列表的读权限） */
function ProjectPlanPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const { workspaceUserInfo } = useUserPermissions();
  const { canView } = useProjectStagePermissions(workspaceSlug, projectId);

  const project = getProjectById(projectId);
  const pageTitle = project?.name
    ? `${project.name} - ${t("project_stage.plan.page_title")}`
    : t("project_stage.plan.page_title");

  // 权限是异步拉的，没回来之前不要闪 403
  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <ProjectPlan workspaceSlug={workspaceSlug} projectId={projectId} />
    </>
  );
}

export default observer(ProjectPlanPage);
