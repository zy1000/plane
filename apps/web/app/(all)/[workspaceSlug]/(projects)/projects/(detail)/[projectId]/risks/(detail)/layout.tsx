import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { RiskDetailHeader } from "./header";

export default function RiskDetailLayout() {
  return (
    <>
      <AppHeader header={<RiskDetailHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
