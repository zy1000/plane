"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { STAGE_REVIEWS_HEADER_ACTIONS_ID, STAGE_REVIEWS_HEADER_COUNT_ID } from "@/components/stage-reviews";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

export const StageReviewsHeader = observer(function StageReviewsHeader() {
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const { loader } = useProject();
  const { t } = useTranslation();

  return (
    <Header>
      <Header.LeftItem>
        <div className="flex items-center gap-2.5">
          <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
            <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label={t("stage_review.breadcrumb")}
                  href={`/${workspaceSlug}/projects/${projectId}/stage-reviews`}
                  icon={<ClipboardCheck className="h-4 w-4 text-tertiary" />}
                  isLast
                />
              }
              isLast
            />
          </Breadcrumbs>
          {/* 数量徽章与右侧的搜索 / 筛选 / 显示都由列表组件 portal 进来：状态只在列表里有 */}
          <div id={STAGE_REVIEWS_HEADER_COUNT_ID} className="flex items-center" />
        </div>
      </Header.LeftItem>
      <Header.RightItem className="shrink-0">
        <div id={STAGE_REVIEWS_HEADER_ACTIONS_ID} className="flex items-center gap-2" />
      </Header.RightItem>
    </Header>
  );
});
