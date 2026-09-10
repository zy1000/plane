import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ReviewTailoringsListHeader } from "./header";

export default function ProjectReviewTailoringsListLayout() {
  return (
    <>
      <AppHeader header={<ReviewTailoringsListHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
