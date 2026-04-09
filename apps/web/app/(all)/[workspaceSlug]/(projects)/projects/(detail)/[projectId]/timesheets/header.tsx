import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Clock } from "lucide-react";
import { Header, Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

export const TimesheetsHeader = observer(function TimesheetsHeader() {
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const { currentProjectDetails, loader } = useProject();

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label="工时"
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/timesheets`}
                icon={<Clock className="h-4 w-4 text-secondary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});
