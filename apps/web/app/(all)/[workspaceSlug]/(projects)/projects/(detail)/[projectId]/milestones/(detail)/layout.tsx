import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { MilestoneIssuesHeader } from "./header";

export default function ProjectMilestoneIssuesLayout() {
  return (
    <>
      <AppHeader header={<MilestoneIssuesHeader />} />
      <ContentWrapper>
        <Outlet />
        <IssuePeekOverview />
      </ContentWrapper>
    </>
  );
}
