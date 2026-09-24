import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProjectStagesHeader } from "./header";

export default function ProjectStagesLayout() {
  return (
    <>
      <AppHeader header={<ProjectStagesHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
