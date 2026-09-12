import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ReviewTailoringDetailHeader } from "./header";

/**
 * 顶栏只有面包屑与两个挂点；表名、主按钮、「⋯」菜单由详情组件 portal 进来 ——
 * 它们随状态变，数据只在详情组件里有。
 */
export default function ProjectReviewTailoringDetailLayout() {
  return (
    <>
      <AppHeader header={<ReviewTailoringDetailHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
