"use client";

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { RiskList, useRiskPermissions } from "@/components/risks";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import type { Route } from "./+types/page";

function RisksPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const { getWorkspaceBySlug } = useWorkspace();
  const { workspaceUserInfo } = useUserPermissions();
  const { canView } = useRiskPermissions(workspaceSlug, projectId);

  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project.name} - ${t("risk.page_title")}` : t("risk.page_title");

  // 权限是异步拉的，没回来之前不要闪 403
  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <RiskList
        workspaceSlug={workspaceSlug}
        workspaceId={getWorkspaceBySlug(workspaceSlug)?.id ?? ""}
        projectId={projectId}
      />
    </>
  );
}

export default observer(RisksPage);
