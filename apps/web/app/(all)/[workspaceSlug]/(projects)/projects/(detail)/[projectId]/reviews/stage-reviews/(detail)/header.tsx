"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { STAGE_REVIEW_DETAIL_HEADER_ACTIONS_ID, STAGE_REVIEW_DETAIL_HEADER_TITLE_ID } from "@/components/stage-reviews";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

export const StageReviewDetailHeader = observer(function StageReviewDetailHeader() {
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const { loader } = useProject();
  const { t } = useTranslation();

  return (
    <Header>
      <Header.LeftItem>
        <div className="flex min-w-0 items-center">
          <Breadcrumbs className="grow-0" onBack={router.back} isLoading={loader === "init-loader"}>
            <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label={t("stage_review.breadcrumb")}
                  href={`/${workspaceSlug}/projects/${projectId}/stage-reviews`}
                  icon={<ClipboardCheck className="h-4 w-4 text-tertiary" />}
                />
              }
            />
          </Breadcrumbs>
          {/* 标题挂点放在 Breadcrumbs 外面：它加载中会把子元素整批换成骨架，挂点跟着被卸掉，portal 就找不到了 */}
          <div id={STAGE_REVIEW_DETAIL_HEADER_TITLE_ID} className="flex h-6 min-w-0 items-center" />
        </div>
      </Header.LeftItem>
      <Header.RightItem className="shrink-0">
        <div id={STAGE_REVIEW_DETAIL_HEADER_ACTIONS_ID} className="flex items-center gap-2" />
      </Header.RightItem>
    </Header>
  );
});
