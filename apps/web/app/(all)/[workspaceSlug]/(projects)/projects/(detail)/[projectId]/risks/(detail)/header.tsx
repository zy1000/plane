"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { RISK_DETAIL_HEADER_ACTIONS_ID, RISK_DETAIL_HEADER_TITLE_ID } from "@/components/risks";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

/** 独立详情页顶栏：面包屑到「风险」，末段编号与右侧保存状态由详情组件 portal 进来 */
export const RiskDetailHeader = observer(function RiskDetailHeader() {
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const { loader } = useProject();
  const { t } = useTranslation();

  const slug = workspaceSlug?.toString() ?? "";
  const project = projectId?.toString() ?? "";

  return (
    <Header>
      <Header.LeftItem>
        <div className="flex min-w-0 items-center">
          <Breadcrumbs className="grow-0" onBack={router.back} isLoading={loader === "init-loader"}>
            <CommonProjectBreadcrumbs workspaceSlug={slug} projectId={project} />
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label={t("risk.title")}
                  href={`/${slug}/projects/${project}/risks/`}
                  icon={<ShieldAlert className="h-4 w-4 text-tertiary" />}
                />
              }
            />
          </Breadcrumbs>
          {/* 标题挂点放在 Breadcrumbs 外面：它加载中会把子元素整批换成骨架，挂点跟着被卸掉，portal 就找不到了 */}
          <div id={RISK_DETAIL_HEADER_TITLE_ID} className="flex h-6 min-w-0 items-center" />
        </div>
      </Header.LeftItem>
      <Header.RightItem className="shrink-0">
        <div id={RISK_DETAIL_HEADER_ACTIONS_ID} className="flex items-center gap-2" />
      </Header.RightItem>
    </Header>
  );
});
