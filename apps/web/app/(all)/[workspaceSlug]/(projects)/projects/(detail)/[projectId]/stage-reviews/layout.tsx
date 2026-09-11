import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { StageReviewsHeader } from "./header";

export default function ProjectStageReviewsLayout() {
  return (
    <>
      <AppHeader header={<StageReviewsHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
