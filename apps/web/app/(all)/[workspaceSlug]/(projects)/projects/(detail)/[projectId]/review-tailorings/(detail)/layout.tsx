import { Outlet } from "react-router";
import { ContentWrapper } from "@/components/core/content-wrapper";

/**
 * 详情页自己渲染头部（标题可就地改、操作按钮随状态变），所以这里不套 AppHeader，
 * 只留内容容器 —— 口径同项目「产品」页。
 */
export default function ProjectReviewTailoringDetailLayout() {
  return (
    <ContentWrapper>
      <Outlet />
    </ContentWrapper>
  );
}
