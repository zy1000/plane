import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { TimesheetsHeader } from "./header";

export default function ProjectTimesheetsLayout() {
  return (
    <>
      <AppHeader header={<TimesheetsHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
