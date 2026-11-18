"use client";

import { observer } from "mobx-react";
import Link from "next/link";
import { useTranslation } from "@plane/i18n";
import { Spinner } from "@plane/ui";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { useProjectStagePermissions } from "@/components/project-stages";
import { ProjectStageDetailRoot } from "@/components/project-stages/detail/project-stage-detail-root";
import { useProject } from "@/hooks/store/use-project";
import { useProjectStage } from "@/hooks/store/use-project-stage";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

function ProjectStageDetailPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, stageId } = params;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const { workspaceUserInfo } = useUserPermissions();
  const { canView } = useProjectStagePermissions(workspaceSlug, projectId);
  const { getProjectStageIds, getStageById } = useProjectStage();

  const project = getProjectById(projectId);
  // 阶段池由项目外壳预热；还没拉回来是 null，拉回来但没有这个阶段就是不存在
  const isStagesLoaded = getProjectStageIds(projectId) !== null;
  const stage = getStageById(stageId);
  const pageTitle = project?.name && stage?.name ? `${project.name} - ${stage.name}` : t("project_stage.page_title");

  // 权限是异步拉的，没回来之前不要闪 403
  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  if (!isStagesLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!stage || stage.project_id !== projectId) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-13 text-tertiary">
        <span>{t("project_stage.detail.not_found")}</span>
        <Link
          href={`/${workspaceSlug}/projects/${projectId}/stages/`}
          className="font-medium text-accent-primary hover:underline"
        >
          {t("project_stage.detail.back_to_list")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="h-full w-full">
        <ProjectStageDetailRoot workspaceSlug={workspaceSlug} projectId={projectId} stageId={stageId} />
      </div>
    </>
  );
}

export default observer(ProjectStageDetailPage);
