"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Scissors } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import {
  REVIEW_TAILORINGS_HEADER_ACTIONS_ID,
  REVIEW_TAILORINGS_HEADER_COUNT_ID,
} from "@/components/review-tailorings";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

export const ReviewTailoringsListHeader = observer(function ReviewTailoringsListHeader() {
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
                  label={t("review_tailoring.breadcrumb")}
                  href={`/${workspaceSlug}/projects/${projectId}/review-tailorings`}
                  icon={<Scissors className="h-4 w-4 text-tertiary" />}
                  isLast
                />
              }
              isLast
            />
          </Breadcrumbs>
          {/* 数量徽章与右侧操作都由列表组件 portal 进来：数据与筛选状态只在列表里有 */}
          <div id={REVIEW_TAILORINGS_HEADER_COUNT_ID} className="flex items-center" />
        </div>
      </Header.LeftItem>
      <Header.RightItem className="shrink-0">
        <div id={REVIEW_TAILORINGS_HEADER_ACTIONS_ID} className="flex items-center gap-2" />
      </Header.RightItem>
    </Header>
  );
});
