"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Layers } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PROJECT_STAGES_HEADER_ACTIONS_ID } from "@/components/project-stages";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

/** 页头左侧面包屑；右侧的搜索 / 带出 / 新建由列表组件 portal 进挂点 */
export const ProjectStagesHeader = observer(function ProjectStagesHeader() {
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { currentProjectDetails, loader } = useProject();

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={t("project_stage.title")}
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/stages/`}
                icon={<Layers className="h-4 w-4 text-secondary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem className="shrink-0">
        <div id={PROJECT_STAGES_HEADER_ACTIONS_ID} className="flex items-center gap-2" />
      </Header.RightItem>
    </Header>
  );
});
