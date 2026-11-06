import { Outlet } from "react-router";
import { ContentWrapper } from "@/components/core/content-wrapper";

// 搜索在时间轴上方的工具栏里，不再单独占一行页头
export default function ProjectPlanLayout() {
  return (
    <ContentWrapper>
      <Outlet />
    </ContentWrapper>
  );
}
