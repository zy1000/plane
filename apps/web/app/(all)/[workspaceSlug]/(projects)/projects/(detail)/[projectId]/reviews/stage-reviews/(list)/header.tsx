"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Header } from "@plane/ui";
import { ReviewsSubNav } from "@/components/reviews";
import { STAGE_REVIEWS_HEADER_ACTIONS_ID } from "@/components/stage-reviews";

/**
 * 页头左侧是「阶段评审 / 裁剪」子页页签（项目名已在顶部标签栏里，不再重复面包屑）；
 * 数量徽章挂点在页签内部，右侧的搜索 / 筛选 / 显示由列表组件 portal 进来。
 */
export const StageReviewsHeader = observer(function StageReviewsHeader() {
  const { workspaceSlug, projectId } = useParams();

  return (
    <Header>
      <Header.LeftItem>
        <ReviewsSubNav workspaceSlug={workspaceSlug?.toString() ?? ""} projectId={projectId?.toString() ?? ""} />
      </Header.LeftItem>
      <Header.RightItem className="shrink-0">
        <div id={STAGE_REVIEWS_HEADER_ACTIONS_ID} className="flex items-center gap-2" />
      </Header.RightItem>
    </Header>
  );
});
