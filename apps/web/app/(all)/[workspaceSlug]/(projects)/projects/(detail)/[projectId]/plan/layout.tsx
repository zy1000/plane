import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProjectPlanHeader } from "./header";

export default function ProjectPlanLayout() {
  return (
    <>
      <AppHeader header={<ProjectPlanHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
