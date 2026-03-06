import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Outlet } from "react-router";
import { ProjectsAppPowerKProvider } from "@/components/power-k/projects-app-provider";
import { ChangelogModal } from "@/modules/changelog";
// plane web components
import { ProjectAppSidebar } from "./_sidebar";
import { ExtendedProjectSidebar } from "./extended-project-sidebar";

function WorkspaceLayout() {
  const { workspaceSlug } = useParams();

  return (
    <>
      <ProjectsAppPowerKProvider />
      {workspaceSlug && <ChangelogModal workspaceSlug={workspaceSlug.toString()} />}
      <div className="relative flex flex-col h-full w-full overflow-hidden rounded-lg border border-custom-border-200">
        <div id="full-screen-portal" className="inset-0 absolute w-full" />
        <div className="relative flex size-full overflow-hidden">
          <ProjectAppSidebar />
          <ExtendedProjectSidebar />
          <main className="relative flex h-full w-full flex-col overflow-hidden bg-custom-background-100">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}

export default observer(WorkspaceLayout);
