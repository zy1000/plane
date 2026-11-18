import { Outlet } from "react-router";
import { ContentWrapper } from "@/components/core/content-wrapper";

// 阶段详情页的页头（面包屑 + 工作项工具栏）由正文 ProjectStageDetailRoot 自己渲染，这里不放 AppHeader
export default function ProjectStageDetailLayout() {
  return (
    <ContentWrapper>
      <Outlet />
    </ContentWrapper>
  );
}
