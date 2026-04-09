import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { WorkspaceTimesheetsHeader } from "./header";

export default function WorkspaceTimesheetsLayout() {
  return (
    <>
      <AppHeader header={<WorkspaceTimesheetsHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
