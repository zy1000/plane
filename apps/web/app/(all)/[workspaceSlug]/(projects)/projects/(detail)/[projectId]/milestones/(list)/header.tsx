import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Milestone } from "lucide-react";
// ui
import { Header, Breadcrumbs } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

const OPEN_MILESTONE_MODAL_EVENT = "milestones:list:milestone-modal:open";

export const MilestonesListHeader = observer(function MilestonesListHeader() {
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();

  // store hooks
  const { currentProjectDetails, loader } = useProject();
  const { allowPermissions } = useUserPermissions();

  const canCreateMilestone = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.PROJECT);

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label="里程碑"
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/milestones/`}
                icon={<Milestone className="h-4 w-4 text-custom-text-300" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      {canCreateMilestone ? (
        <Header.RightItem>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              window.dispatchEvent(new CustomEvent(OPEN_MILESTONE_MODAL_EVENT, { detail: { mode: "create" } }));
            }}
          >
            添加里程碑
          </Button>
        </Header.RightItem>
      ) : (
        <></>
      )}
    </Header>
  );
});
