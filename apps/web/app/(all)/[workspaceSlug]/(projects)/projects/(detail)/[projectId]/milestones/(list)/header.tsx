import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Milestone } from "lucide-react";
// ui
import { Header, Breadcrumbs } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { PROJECT_MILESTONE_CREATE_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { projectSetToastError } from "@/utils/project-error-toast";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

const OPEN_MILESTONE_MODAL_EVENT = "milestones:list:milestone-modal:open";

export const MilestonesListHeader = observer(function MilestonesListHeader() {
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();

  // store hooks
  const { currentProjectDetails, loader } = useProject();
  const { allowProjectPermissionKeys } = useUserPermissions();

  const canCreateMilestone = allowProjectPermissionKeys(
    [PROJECT_MILESTONE_CREATE_PERMISSION_KEY],
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label="Milestones"
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/milestones/`}
                icon={<Milestone className="h-4 w-4 text-secondary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem>
        <Button
          variant="primary"
          onClick={() => {
            if (!canCreateMilestone) {
              projectSetToastError({ error: "您没有所需的项目权限。" }, t, "您没有所需的项目权限。");
              return;
            }
            window.dispatchEvent(new CustomEvent(OPEN_MILESTONE_MODAL_EVENT, { detail: { mode: "create" } }));
          }}
        >
          添加里程碑
        </Button>
      </Header.RightItem>
    </Header>
  );
});
