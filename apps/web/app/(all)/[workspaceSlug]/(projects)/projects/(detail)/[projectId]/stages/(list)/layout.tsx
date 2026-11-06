import { Outlet } from "react-router";
import { ContentWrapper } from "@/components/core/content-wrapper";

// 搜索 / 带出 / 新建在正文顶部的统计行右侧，不再单独占一行页头
export default function ProjectStagesLayout() {
  return (
    <ContentWrapper>
      <Outlet />
    </ContentWrapper>
  );
}
