import { Outlet } from "react-router";
// components
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { MilestonesListHeader } from "./header";

export default function ProjectMilestonesListLayout() {
  return (
    <>
      <AppHeader header={<MilestonesListHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
