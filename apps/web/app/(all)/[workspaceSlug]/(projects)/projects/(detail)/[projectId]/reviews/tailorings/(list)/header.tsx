"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Header } from "@plane/ui";
import { REVIEW_TAILORINGS_HEADER_ACTIONS_ID } from "@/components/review-tailorings";
import { ReviewsSubNav } from "@/components/reviews";

/**
 * 页头左侧是「阶段评审 / 裁剪」子页页签；数量徽章挂点在页签内部，
 * 右侧的搜索 / 筛选 / 新建 / 待签批由列表组件 portal 进来。
 */
export const ReviewTailoringsListHeader = observer(function ReviewTailoringsListHeader() {
  const { workspaceSlug, projectId } = useParams();

  return (
    <Header>
      <Header.LeftItem>
        <ReviewsSubNav workspaceSlug={workspaceSlug?.toString() ?? ""} projectId={projectId?.toString() ?? ""} />
      </Header.LeftItem>
      <Header.RightItem className="shrink-0">
        <div id={REVIEW_TAILORINGS_HEADER_ACTIONS_ID} className="flex items-center gap-2" />
      </Header.RightItem>
    </Header>
  );
});
