"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ClipboardList, Scissors } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import {
  REVIEW_TAILORING_DETAIL_ACTIONS_SLOT_ID,
  REVIEW_TAILORING_DETAIL_TITLE_SLOT_ID,
} from "@/components/review-tailorings";
import { reviewTailoringsPath, reviewsBasePath } from "@/components/reviews";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

export const ReviewTailoringDetailHeader = observer(function ReviewTailoringDetailHeader() {
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
                  label={t("reviews.title")}
                  href={reviewsBasePath(slug, project)}
                  icon={<ClipboardList className="h-4 w-4 text-tertiary" />}
                />
              }
            />
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label={t("reviews.tailorings")}
                  href={reviewTailoringsPath(slug, project)}
                  icon={<Scissors className="h-4 w-4 text-tertiary" />}
                />
              }
            />
          </Breadcrumbs>
          {/* 表名挂点放在 Breadcrumbs 外面：它加载中会把子元素整批换成骨架，挂点跟着被卸掉，portal 就找不到了 */}
          <div id={REVIEW_TAILORING_DETAIL_TITLE_SLOT_ID} className="flex h-6 min-w-0 items-center" />
        </div>
      </Header.LeftItem>
      <Header.RightItem className="shrink-0">
        <div id={REVIEW_TAILORING_DETAIL_ACTIONS_SLOT_ID} className="flex items-center gap-2" />
      </Header.RightItem>
    </Header>
  );
});
