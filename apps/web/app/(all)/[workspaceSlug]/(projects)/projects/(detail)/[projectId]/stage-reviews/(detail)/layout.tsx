import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { StageReviewDetailHeader } from "./header";

/** 顶栏只有面包屑与两个挂点；评审标题、保存状态由详情组件 portal 进来 —— 数据只在详情组件里有 */
export default function ProjectStageReviewDetailLayout() {
  return (
    <>
      <AppHeader header={<StageReviewDetailHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
