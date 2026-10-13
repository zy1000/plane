"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { RISKS_HEADER_ACTIONS_ID } from "@/components/risks";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

/** 页头左侧面包屑；右侧的搜索 / 筛选 / 新建由列表组件 portal 进挂点 */
export const RisksHeader = observer(function RisksHeader() {
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
                label={t("risk.title")}
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/risks/`}
                icon={<ShieldAlert className="h-4 w-4 text-secondary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem className="shrink-0">
        <div id={RISKS_HEADER_ACTIONS_ID} className="flex items-center gap-2" />
      </Header.RightItem>
    </Header>
  );
});
